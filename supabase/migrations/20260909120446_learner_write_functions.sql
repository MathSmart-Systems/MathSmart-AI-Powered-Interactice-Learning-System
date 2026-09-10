-- MathSmart Phase 5 — the learner's own writes.
--
-- Why this migration exists
-- -------------------------
-- Every learner-record table is SELECT-only for `authenticated`. That is
-- deliberate: a learner must never be able to write their own score, and the
-- API must not be the only thing standing between them and one.
--
-- But a learner does legitimately author some of their own record — which
-- sections of a module they have worked through. Two ways of allowing that were
-- rejected:
--
--   * Granting `authenticated` INSERT and UPDATE on app.student_module_progress
--     would let any statement running as the caller write progress, and the
--     completion percentage would then be whatever the caller supplied.
--   * Writing it through the elevated, RLS-bypassing connection would put an
--     ordinary learner action on the path reserved for account provisioning,
--     and would remove the database's own opinion about whose row it is.
--
-- So the write is a function instead. It is SECURITY DEFINER because the tables
-- are SELECT-only for the caller, and it is safe to be so because:
--
--   * the learner is derived from auth.uid() inside the function, never passed
--     in, so the caller cannot name somebody else's record;
--   * a caller with no student profile is rejected;
--   * the completion percentage is computed here from the module's own content,
--     so it is not the caller's to assert;
--   * search_path is empty and every reference is schema-qualified;
--   * EXECUTE is revoked from PUBLIC and granted only to authenticated and
--     service_role;
--   * app is not exposed through the Data API, so these are reachable only
--     through the application's own connection.
--
-- Nothing here grants a new privilege on a table, and no policy is relaxed.

-- ---------------------------------------------------------------------------
-- app.module_section_ids
-- ---------------------------------------------------------------------------
-- A module's sections are its content: the objective, the concept explanation,
-- then one per rule and one per worked example. The backend derives the same
-- list for the module payload it returns, and an integration test holds the two
-- to the same answer.
create function app.module_section_ids(p_module_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array['objective', 'concept']
      || (
        select coalesce(array_agg('rule_' || rule_position), '{}'::text[])
        from generate_series(1, jsonb_array_length(learning_modules.rules)) as rule_position
      )
      || (
        select coalesce(array_agg('example_' || example_position), '{}'::text[])
        from generate_series(
          1, jsonb_array_length(learning_modules.worked_examples)
        ) as example_position
      )
  from app.learning_modules
  where learning_modules.module_id = p_module_id;
$$;

comment on function app.module_section_ids(uuid) is
  'The section identifiers a learning module has, derived from its own content. Two fixed sections plus one per rule and one per worked example.';

revoke all on function app.module_section_ids(uuid) from public;
grant execute on function app.module_section_ids(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.save_module_progress
-- ---------------------------------------------------------------------------
-- Saves the caller's own section progress and returns the stored row. The
-- caller supplies which sections they have finished; everything else — whose
-- row it is, how many sections there are, what percentage that makes, whether
-- the module is complete — is decided here.
create function app.save_module_progress(
  p_module_id uuid,
  p_completed_section_ids text[],
  p_last_section_id text default null
)
returns app.student_module_progress
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_sections text[];
  v_recognised text[];
  v_percentage numeric(5,2);
  v_complete boolean;
  v_row app.student_module_progress;
begin
  -- The learner is the caller. There is no parameter for this on purpose.
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid());

  if v_student_id is null then
    raise exception 'Only a learner may save module progress'
      using errcode = '42501';
  end if;

  -- A module the caller cannot read is not a module they may record progress
  -- against. can_read_content is the same rule the policies use.
  if not exists (
    select 1
    from app.learning_modules
    where learning_modules.module_id = p_module_id
      and app.can_read_content(learning_modules.status)
  ) then
    raise exception 'No such learning module' using errcode = 'P0002';
  end if;

  v_sections := app.module_section_ids(p_module_id);

  -- Unknown identifiers are dropped and repeats collapse, so neither can
  -- inflate the percentage.
  select coalesce(array_agg(section), '{}'::text[]) into v_recognised
  from unnest(v_sections) as section
  where section = any (coalesce(p_completed_section_ids, '{}'::text[]));

  v_percentage := round(
    (cardinality(v_recognised)::numeric * 100) / greatest(cardinality(v_sections), 1)
  );
  v_complete := cardinality(v_sections) > 0
            and cardinality(v_recognised) = cardinality(v_sections);

  insert into app.student_module_progress as progress
    (student_id, module_id, completion_percentage, is_complete,
     completed_section_ids, last_section_id, started_at, completed_at)
  values (
    v_student_id, p_module_id, v_percentage, v_complete,
    to_jsonb(v_recognised), p_last_section_id, now(),
    case when v_complete then now() else null end
  )
  on conflict (student_id, module_id) do update set
    completion_percentage = excluded.completion_percentage,
    is_complete = excluded.is_complete,
    completed_section_ids = excluded.completed_section_ids,
    last_section_id = coalesce(excluded.last_section_id, progress.last_section_id),
    started_at = coalesce(progress.started_at, excluded.started_at),
    completed_at = case
      when excluded.is_complete then coalesce(progress.completed_at, now())
      else null
    end
  returning * into v_row;

  return v_row;
end;
$$;

comment on function app.save_module_progress(uuid, text[], text) is
  'Saves the calling learner''s own module section progress. The learner comes from auth.uid(), and the completion percentage is computed from the module content rather than supplied.';

revoke all on function app.save_module_progress(uuid, text[], text) from public;
grant execute on function app.save_module_progress(uuid, text[], text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.complete_module
-- ---------------------------------------------------------------------------
-- Marking a module complete is the same write with the same rule applied to
-- what is already stored: it succeeds only when every section is finished, and
-- returns no row otherwise so the API can answer 412.
-- Returns a set rather than a single composite, so "no row" is genuinely no
-- row: a plain composite return would hand the caller one row of nulls.
create function app.complete_module(p_module_id uuid)
returns setof app.student_module_progress
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_stored text[];
begin
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid());

  if v_student_id is null then
    raise exception 'Only a learner may complete a module' using errcode = '42501';
  end if;

  select coalesce(
           array_agg(section_id::text),
           '{}'::text[]
         )
    into v_stored
  from app.student_module_progress,
       lateral jsonb_array_elements_text(
         student_module_progress.completed_section_ids
       ) as section_id
  where student_module_progress.student_id = v_student_id
    and student_module_progress.module_id = p_module_id;

  if not exists (
    select 1
    from unnest(app.module_section_ids(p_module_id)) as section
    where section <> all (v_stored)
  ) and cardinality(coalesce(app.module_section_ids(p_module_id), '{}'::text[])) > 0
  then
    return query select * from app.save_module_progress(p_module_id, v_stored, null);
  end if;

  return;
end;
$$;

comment on function app.complete_module(uuid) is
  'Marks the calling learner''s module complete when every section is already finished, and returns no row otherwise.';

revoke all on function app.complete_module(uuid) from public;
grant execute on function app.complete_module(uuid) to authenticated, service_role;
