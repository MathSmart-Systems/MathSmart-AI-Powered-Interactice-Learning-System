-- Advisory text on an intervention: attaching it, and taking it away again.
--
-- The columns `ai_insight`, `ai_recommendation` and their provenance have
-- existed since the contract addendum, and the interventions API has always
-- read them back. Nothing has ever written them, so a teacher who asked for a
-- suggestion had to re-ask for it every time the case was reopened, and the
-- record of what the suggestion said at the moment a decision was taken did
-- not survive the modal being closed.
--
-- These two functions are that writer, and they are deliberately narrow.
-- Neither one touches `status`, `severity`, `intervention_type`,
-- `educator_notes`, `recorded_at` or `resolved_at`: storing a suggestion is
-- not the same act as acting on it, and the teacher's own decision must stay
-- the teacher's own. Advisory text therefore lives in its own columns, where a
-- reader can always tell it apart from the deterministic evidence beside it
-- and from the notes the educator wrote.
--
-- The text itself is never accepted from a browser. The API calls Groq
-- server-side and hands the answer straight to these functions in the same
-- request, so there is no shape in which a client can post words of its own
-- into a field labelled as machine-written.
--
-- `ai_plan` holds the suggestion as structure rather than prose: a learning
-- gap, at most three strategies, one scaffolding idea and one next check. A
-- teacher scanning a case needs to take one strategy and leave the rest, and
-- they cannot do that with a paragraph. `ai_insight` keeps the gap sentence in
-- plain text beside it, so a reader that knows nothing about the plan — an
-- export, a printed report, the existing API contract — still has something
-- true to show.

-- ---------------------------------------------------------------------------
-- The suggestion, as structure
-- ---------------------------------------------------------------------------
alter table app.interventions
  add column if not exists ai_plan jsonb;

comment on column app.interventions.ai_plan is
  'The advisory suggestion as structure: {gap, strategies[], scaffold, next_check}. Written only by app.attach_intervention_advice from server-generated text. Advisory, and authoritative for nothing.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'interventions_ai_plan_is_object'
      and conrelid = 'app.interventions'::regclass
  ) then
    alter table app.interventions
      add constraint interventions_ai_plan_is_object
      check (ai_plan is null or jsonb_typeof(ai_plan) = 'object');
  end if;

  -- A plan without the text beside it would leave the existing contract with
  -- nothing to return, so the two arrive and leave together.
  if not exists (
    select 1 from pg_constraint
    where conname = 'interventions_ai_plan_needs_advice'
      and conrelid = 'app.interventions'::regclass
  ) then
    alter table app.interventions
      add constraint interventions_ai_plan_needs_advice
      check (ai_plan is null or ai_insight is not null or ai_recommendation is not null);
  end if;
end;
$$;

grant insert (ai_plan), update (ai_plan) on app.interventions to authenticated;

-- ---------------------------------------------------------------------------
-- app.attach_intervention_advice
-- ---------------------------------------------------------------------------

-- The signature gained a parameter. Replacing in place would leave the old
-- arity behind as an overload, and two functions that both look right is worse
-- than one that has changed.
drop function if exists app.attach_intervention_advice(uuid, text, text, text, text, numeric, text);

create or replace function app.attach_intervention_advice(
  p_intervention_id uuid,
  p_insight text default null,
  p_recommendation text default null,
  p_provider text default null,
  p_model text default null,
  p_confidence numeric default null,
  p_plan jsonb default null,
  p_request_id text default null
)
returns app.interventions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row app.interventions;
  v_insight text := nullif(btrim(coalesce(p_insight, '')), '');
  v_recommendation text := nullif(btrim(coalesce(p_recommendation, '')), '');
begin
  if not app.is_teacher_admin() or not app.is_active_account() then
    raise exception 'Only a Teacher/Administrator may attach advisory text to an intervention'
      using errcode = '42501';
  end if;

  -- An empty suggestion is not a suggestion. Refusing it here keeps the
  -- provenance constraint from being the thing that explains the mistake.
  if v_insight is null and v_recommendation is null then
    raise exception 'Advisory text cannot be empty'
      using errcode = '23514';
  end if;

  select *
  into v_row
  from app.interventions
  where interventions.intervention_id = p_intervention_id
    and interventions.archived_at is null
  for update;

  if v_row.intervention_id is null then
    raise exception 'No such intervention'
      using errcode = 'P0002';
  end if;

  update app.interventions
  set ai_insight = v_insight,
      ai_recommendation = v_recommendation,
      ai_provider = nullif(btrim(coalesce(p_provider, '')), ''),
      ai_model = nullif(btrim(coalesce(p_model, '')), ''),
      ai_confidence_score = p_confidence,
      ai_plan = case when jsonb_typeof(p_plan) = 'object' then p_plan else null end,
      ai_generated_at = now()
  where interventions.intervention_id = p_intervention_id
  returning * into v_row;

  -- The details say that advice arrived and what shape it had. The model
  -- identifier is deployment configuration and stays out of the audit trail;
  -- it is carried on the case itself as provenance, which is where the
  -- documented contract asks for it.
  perform app.record_audit_event(
    'intervention.advice_attached',
    'intervention',
    p_intervention_id,
    p_request_id,
    jsonb_build_object(
      'has_insight', v_insight is not null,
      'has_recommendation', v_recommendation is not null,
      'has_plan', jsonb_typeof(p_plan) = 'object'
    )
  );

  return v_row;
end;
$$;

comment on function app.attach_intervention_advice(uuid, text, text, text, text, numeric, jsonb, text) is
  'Stores server-generated advisory text and its provenance against one open intervention. Touches no deterministic field and no educator-authored field, so a stored suggestion is never an applied one.';

revoke all on function app.attach_intervention_advice(uuid, text, text, text, text, numeric, jsonb, text) from public;
grant execute on function app.attach_intervention_advice(uuid, text, text, text, text, numeric, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.clear_intervention_advice
-- ---------------------------------------------------------------------------
create or replace function app.clear_intervention_advice(
  p_intervention_id uuid,
  p_request_id text default null
)
returns app.interventions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row app.interventions;
begin
  if not app.is_teacher_admin() or not app.is_active_account() then
    raise exception 'Only a Teacher/Administrator may dismiss advisory text on an intervention'
      using errcode = '42501';
  end if;

  update app.interventions
  set ai_insight = null,
      ai_recommendation = null,
      ai_provider = null,
      ai_model = null,
      ai_confidence_score = null,
      ai_plan = null,
      ai_generated_at = null
  where interventions.intervention_id = p_intervention_id
    and interventions.archived_at is null
  returning * into v_row;

  if v_row.intervention_id is null then
    raise exception 'No such intervention'
      using errcode = 'P0002';
  end if;

  -- Dismissing is a decision, so it is audited like one. A teacher who read a
  -- suggestion and rejected it leaves a trace saying so.
  perform app.record_audit_event(
    'intervention.advice_dismissed', 'intervention', p_intervention_id, p_request_id, '{}'::jsonb
  );

  return v_row;
end;
$$;

comment on function app.clear_intervention_advice(uuid, text) is
  'Removes advisory text and its provenance from one open intervention, leaving every deterministic and educator-authored field untouched. Audited as the teacher decision it is.';

revoke all on function app.clear_intervention_advice(uuid, text) from public;
grant execute on function app.clear_intervention_advice(uuid, text) to authenticated, service_role;
