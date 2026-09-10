-- MathSmart Phase 6 — hardening the SECURITY DEFINER write functions.
--
-- Why this migration exists
-- -------------------------
-- Phase 5b stated the account-status rule once, as a restrictive policy per
-- table: whatever else is permitted, the caller's account must be active. That
-- covers every path an ordinary connection can take, because an ordinary
-- connection is subject to Row Level Security.
--
-- The write functions are not. SECURITY DEFINER is exactly the property that
-- makes them able to write tables the caller may only read, and it is also the
-- property that stops `<table>_requires_an_active_account` from ever running
-- inside them. A suspended or archived account holding a token that has not yet
-- expired was therefore still able to save progress, submit an assessment, open
-- an intervention or change somebody else's account status — the very window
-- the Phase 5b policies were written to close. The rule has to be restated in
-- each function, so that is what the first part of this migration does, without
-- changing a single message or errcode a caller already depends on.
--
-- The remainder repairs defects of the same review: two payloads that could
-- abort a save, a grading helper that gave up on an absurd number instead of
-- ignoring it, a hint that could be asked for against somebody else's question,
-- a lifecycle transition the workflow does not have, a reset that left the old
-- baseline behind, a path rebuild that reached beyond the diagnostic that
-- produced it, and a secret-shaped-value check that did not know two of the
-- commonest words for a credential.
--
-- Every function is replaced rather than altered, so the definition here is the
-- whole definition. The existing comments, grants and revocations survive
-- CREATE OR REPLACE; the comments that would now read falsely are reissued.

-- ---------------------------------------------------------------------------
-- app.looks_like_a_secret
-- ---------------------------------------------------------------------------
-- The key check on app.system_settings already rejects `credential` and any
-- `token`, but the value check did not: `{"credential": "..."}` and
-- `{"auth_token": "..."}` both passed, in a column whose whole purpose is to
-- keep deployment secrets out of the database. Both are now matched, and the
-- two token spellings are one alternative so the pattern stays readable.
create or replace function app.looks_like_a_secret(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value::text ~* '(api[_-]?key|secret|password|credential|(access|auth)[_-]?token|service[_-]?role|groq[_-]?model)';
$$;

comment on function app.looks_like_a_secret(jsonb) is
  'True when a configuration value looks like a credential, a token or a model selection. Used to keep deployment secrets out of app.system_settings, out of audit details and out of stored preferences.';

-- ---------------------------------------------------------------------------
-- app.numeric_of
-- ---------------------------------------------------------------------------
-- A learner can type anything, and "1e1000000" is a perfectly well-formed
-- number that numeric cannot hold. That raises numeric_value_out_of_range
-- rather than invalid_text_representation, so the cast escaped the handler and
-- aborted the whole submission instead of grading one answer wrong. An answer
-- no numeric can represent is not a number for comparison purposes, which is
-- what NULL already means here.
create or replace function app.numeric_of(p_value jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) not in ('number', 'string') then
    return null;
  end if;
  return btrim(p_value #>> '{}')::numeric;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return null;
end;
$$;

comment on function app.numeric_of(jsonb) is
  'The numeric value of a JSON scalar, or NULL when it is not one this database can hold. Used so 4.20 and 4.2 grade alike, and so an answer of 1e1000000 grades wrong rather than aborting the submission.';

-- ---------------------------------------------------------------------------
-- app.save_module_progress
-- ---------------------------------------------------------------------------
create or replace function app.save_module_progress(
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
  -- The learner is the caller. There is no parameter for this on purpose, and
  -- the account must still be active: this function's own SECURITY DEFINER
  -- rights are what keep the restrictive account-status policy from running.
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

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

-- ---------------------------------------------------------------------------
-- app.complete_module
-- ---------------------------------------------------------------------------
create or replace function app.complete_module(p_module_id uuid)
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
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

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

-- ---------------------------------------------------------------------------
-- app.start_assessment_attempt
-- ---------------------------------------------------------------------------
create or replace function app.start_assessment_attempt(p_assessment_id uuid)
returns app.assessment_attempts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_version integer;
  v_row app.assessment_attempts;
begin
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

  if v_student_id is null then
    raise exception 'Only a learner may attempt an assessment' using errcode = '42501';
  end if;

  select assessments.version into v_version
  from app.assessments
  where assessments.assessment_id = p_assessment_id
    and assessments.status = 'published'::app.publication_status;

  if v_version is null then
    raise exception 'No such published assessment' using errcode = 'P0002';
  end if;

  select * into v_row
  from app.assessment_attempts
  where assessment_attempts.student_id = v_student_id
    and assessment_attempts.assessment_id = p_assessment_id
    and assessment_attempts.status = 'in_progress'::app.attempt_status;

  if found then
    return v_row;
  end if;

  insert into app.assessment_attempts (assessment_id, student_id, assessment_version)
  values (p_assessment_id, v_student_id, v_version)
  returning * into v_row;

  -- A learner who has begun the diagnostic is no longer "not started".
  update app.student_profiles
  set diagnostic_status = 'in_progress'::app.diagnostic_status
  where student_profiles.student_id = v_student_id
    and student_profiles.diagnostic_status = 'not_started'::app.diagnostic_status
    and exists (
      select 1 from app.assessments
      where assessments.assessment_id = p_assessment_id
        and assessments.assessment_type = 'diagnostic'::app.assessment_type
    );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.save_assessment_answers
-- ---------------------------------------------------------------------------
create or replace function app.save_assessment_answers(p_attempt_id uuid, p_answers jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_assessment_id uuid;
  v_saved integer;
begin
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

  if v_student_id is null then
    raise exception 'Only a learner may answer an assessment' using errcode = '42501';
  end if;

  select assessment_attempts.assessment_id into v_assessment_id
  from app.assessment_attempts
  where assessment_attempts.attempt_id = p_attempt_id
    and assessment_attempts.student_id = v_student_id
    and assessment_attempts.status = 'in_progress'::app.attempt_status;

  if v_assessment_id is null then
    raise exception 'No attempt of yours is in progress' using errcode = 'P0002';
  end if;

  with submitted as (
    select
      (answer.value ->> 'question_id')::uuid as question_id,
      answer.value -> 'answer' as answer,
      answer.answer_position
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
      with ordinality as answer(value, answer_position)
    where answer.value ? 'question_id'
  ),
  belonging as (
    -- One row per question, whatever the client sent. A payload carrying the
    -- same question twice would otherwise ask the ON CONFLICT clause below to
    -- update one row twice in a single statement, which Postgres refuses with
    -- cardinality_violation and which would lose the whole save. The last
    -- answer in the array wins, because that is the one the learner was
    -- looking at when they stopped typing.
    select distinct on (submitted.question_id)
      submitted.question_id, submitted.answer, submitted.answer_position
    from submitted
    join app.assessment_questions
      on assessment_questions.question_id = submitted.question_id
     and assessment_questions.assessment_id = v_assessment_id
    order by submitted.question_id, submitted.answer_position desc
  ),
  saved as (
    insert into app.assessment_responses (attempt_id, question_id, answer)
    select p_attempt_id, belonging.question_id, belonging.answer
    from belonging
    on conflict (attempt_id, question_id) do update
      set answer = excluded.answer, is_correct = null
    returning 1
  )
  select count(*) into v_saved from saved;

  return v_saved;
end;
$$;

comment on function app.save_assessment_answers(uuid, jsonb) is
  'Saves answers to the calling learner''s own attempt while it is in progress. Grades nothing, and counts a question once however many times the payload repeats it.';

-- ---------------------------------------------------------------------------
-- app.submit_assessment_attempt
-- ---------------------------------------------------------------------------
create or replace function app.submit_assessment_attempt(p_attempt_id uuid, p_answers jsonb default null)
returns app.assessment_attempts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_assessment_id uuid;
  v_assessment_type app.assessment_type;
  v_raw integer;
  v_max integer;
  v_row app.assessment_attempts;
begin
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

  if v_student_id is null then
    raise exception 'Only a learner may submit an assessment' using errcode = '42501';
  end if;

  select assessment_attempts.assessment_id into v_assessment_id
  from app.assessment_attempts
  where assessment_attempts.attempt_id = p_attempt_id
    and assessment_attempts.student_id = v_student_id
    and assessment_attempts.status = 'in_progress'::app.attempt_status
  for update;

  if v_assessment_id is null then
    raise exception 'No attempt of yours is in progress' using errcode = 'P0002';
  end if;

  if p_answers is not null then
    perform app.save_assessment_answers(p_attempt_id, p_answers);
  end if;

  select assessments.assessment_type into v_assessment_type
  from app.assessments
  where assessments.assessment_id = v_assessment_id;

  -- Every question in the assessment counts, answered or not. A question left
  -- blank is wrong, not absent.
  insert into app.assessment_responses (attempt_id, question_id, answer)
  select p_attempt_id, assessment_questions.question_id, null
  from app.assessment_questions
  where assessment_questions.assessment_id = v_assessment_id
  on conflict (attempt_id, question_id) do nothing;

  update app.assessment_responses
  set is_correct = app.answer_is_correct(
        assessment_responses.answer, questions.answer_key
      ),
      question_version = questions.version
  from app.questions
  where questions.question_id = assessment_responses.question_id
    and assessment_responses.attempt_id = p_attempt_id;

  -- Per-competency evidence, recorded before the aggregate that derives from it.
  insert into app.competency_results
    (attempt_id, competency_id, raw_score, max_score, percentage, mastery_band)
  select
    p_attempt_id,
    questions.competency_id,
    count(*) filter (where assessment_responses.is_correct)::integer,
    count(*)::integer,
    app.percentage_for(
      count(*) filter (where assessment_responses.is_correct)::integer, count(*)::integer
    ),
    app.mastery_band_for(
      app.percentage_for(
        count(*) filter (where assessment_responses.is_correct)::integer, count(*)::integer
      )
    )
  from app.assessment_responses
  join app.questions on questions.question_id = assessment_responses.question_id
  where assessment_responses.attempt_id = p_attempt_id
  group by questions.competency_id
  on conflict (attempt_id, competency_id) do update set
    raw_score = excluded.raw_score,
    max_score = excluded.max_score,
    percentage = excluded.percentage,
    mastery_band = excluded.mastery_band;

  select
    count(*) filter (where assessment_responses.is_correct)::integer,
    count(*)::integer
  into v_raw, v_max
  from app.assessment_responses
  where assessment_responses.attempt_id = p_attempt_id;

  -- The running aggregate. A diagnostic also sets the baseline it is named for.
  insert into app.competency_progress
    (student_id, competency_id, diagnostic_score, current_score, mastery_band,
     attempt_count, last_studied_at)
  select
    v_student_id,
    competency_results.competency_id,
    case when v_assessment_type = 'diagnostic'::app.assessment_type
         then competency_results.percentage end,
    competency_results.percentage,
    competency_results.mastery_band,
    1,
    now()
  from app.competency_results
  where competency_results.attempt_id = p_attempt_id
  on conflict (student_id, competency_id) do update set
    diagnostic_score = coalesce(
      competency_progress.diagnostic_score, excluded.diagnostic_score
    ),
    current_score = excluded.current_score,
    mastery_band = excluded.mastery_band,
    attempt_count = competency_progress.attempt_count + 1,
    last_studied_at = now();

  -- The targeted path is the diagnostic's own output, so only a diagnostic may
  -- rebuild it. A reassessment or a unit quiz covers a slice of the curriculum
  -- and knows nothing about the competencies outside it; letting one clear the
  -- table would throw away items the learner is part-way through, and the
  -- completed ones with them, on the evidence of a single quiz.
  if v_assessment_type = 'diagnostic'::app.assessment_type then
    delete from app.learning_path_items
    where learning_path_items.student_id = v_student_id;

    insert into app.learning_path_items
      (student_id, competency_id, module_id, priority, reason, status)
    select
      v_student_id,
      ranked.competency_id,
      ranked.module_id,
      ranked.priority,
      'Assessment score of ' || trim(trailing '.' from trim(trailing '0' from
        ranked.percentage::text)) || '% places this competency in the '
        || ranked.mastery_band || ' band.',
      case
        when ranked.module_is_complete then 'completed'::app.path_item_status
        when ranked.priority = 1 then 'available'::app.path_item_status
        else 'locked'::app.path_item_status
      end
    from (
      select
        competency_results.competency_id,
        competency_results.percentage,
        competency_results.mastery_band::text as mastery_band,
        first_module.module_id,
        coalesce(progress.is_complete, false) as module_is_complete,
        row_number() over (
          order by competency_results.percentage, competency_results.competency_id
        )::integer as priority
      from app.competency_results
      join lateral (
        select learning_modules.module_id
        from app.learning_modules
        where learning_modules.competency_id = competency_results.competency_id
          and learning_modules.status = 'published'::app.publication_status
        order by learning_modules.order_index
        limit 1
      ) as first_module on true
      left join app.student_module_progress as progress
        on progress.module_id = first_module.module_id
       and progress.student_id = v_student_id
      where competency_results.attempt_id = p_attempt_id
        and competency_results.mastery_band <> 'Mastered'::app.mastery_band
    ) as ranked;
  end if;

  update app.assessment_attempts
  set status = 'scored'::app.attempt_status,
      overall_score = app.percentage_for(v_raw, v_max),
      submitted_at = now()
  where assessment_attempts.attempt_id = p_attempt_id
  returning * into v_row;

  if v_assessment_type = 'diagnostic'::app.assessment_type then
    update app.student_profiles
    set diagnostic_status = 'completed'::app.diagnostic_status
    where student_profiles.student_id = v_student_id;
  end if;

  return v_row;
end;
$$;

comment on function app.submit_assessment_attempt(uuid, jsonb) is
  'Grades the calling learner''s attempt deterministically against the stored answer keys and writes the responses, per-competency results and aggregate progress in one transaction. Only a diagnostic rebuilds the targeted path, which is the diagnostic''s own output.';

-- ---------------------------------------------------------------------------
-- app.authorize_reassessment
-- ---------------------------------------------------------------------------
create or replace function app.authorize_reassessment(
  p_student_id uuid,
  p_assessment_id uuid,
  p_reason text,
  p_expires_at timestamptz default null,
  p_request_id text default null
)
returns app.reassessment_authorizations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher_admin_id uuid;
  v_actor uuid := (select auth.uid());
  v_row app.reassessment_authorizations;
begin
  select teacher_admin_profiles.teacher_admin_id into v_teacher_admin_id
  from app.teacher_admin_profiles
  where teacher_admin_profiles.user_id = v_actor
    and (select app.is_active_account());

  if v_teacher_admin_id is null or not app.is_teacher_admin() then
    raise exception 'Only a Teacher/Administrator may authorise a reassessment'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from app.student_profiles
    where student_profiles.student_id = p_student_id
  ) then
    raise exception 'No such learner' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from app.assessments
    where assessments.assessment_id = p_assessment_id
      and assessments.status = 'published'::app.publication_status
  ) then
    raise exception 'No such published assessment' using errcode = 'P0002';
  end if;

  insert into app.reassessment_authorizations
    (student_id, assessment_id, authorized_by, reason, expires_at)
  values (p_student_id, p_assessment_id, v_teacher_admin_id, p_reason, p_expires_at)
  returning * into v_row;

  -- The reason is the pedagogical record, so it is kept; nothing else about the
  -- learner is copied here.
  insert into app.audit_events
    (actor_user_id, actor_role, action, target_type, target_id, request_id, details)
  values (
    v_actor,
    'teacher_admin'::app.user_role,
    'assessment.reassessment_authorized',
    'reassessment_authorization',
    v_row.authorization_id,
    p_request_id,
    jsonb_build_object(
      'student_id', p_student_id,
      'assessment_id', p_assessment_id,
      'reason', p_reason
    )
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.start_activity_attempt
-- ---------------------------------------------------------------------------
create or replace function app.start_activity_attempt(p_activity_id uuid)
returns app.activity_attempts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_version integer;
  v_row app.activity_attempts;
begin
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

  if v_student_id is null then
    raise exception 'Only a learner may attempt an activity' using errcode = '42501';
  end if;

  select activities.version into v_version
  from app.activities
  where activities.activity_id = p_activity_id
    and activities.status = 'published'::app.publication_status;

  if v_version is null then
    raise exception 'No such published activity' using errcode = 'P0002';
  end if;

  select * into v_row
  from app.activity_attempts
  where activity_attempts.student_id = v_student_id
    and activity_attempts.activity_id = p_activity_id
    and activity_attempts.status = 'in_progress'::app.attempt_status;

  if found then
    return v_row;
  end if;

  insert into app.activity_attempts
    (student_id, activity_id, attempt_number, activity_version)
  values (
    v_student_id,
    p_activity_id,
    1 + (
      select count(*)
      from app.activity_attempts as earlier
      where earlier.student_id = v_student_id
        and earlier.activity_id = p_activity_id
    ),
    v_version
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.check_activity_answer
-- ---------------------------------------------------------------------------
create or replace function app.check_activity_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_answer jsonb
)
returns table (
  is_correct boolean,
  attempts_for_question integer,
  explanation text,
  hint_available boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_activity_id uuid;
  v_correct boolean;
  v_checks integer;
begin
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

  if v_student_id is null then
    raise exception 'Only a learner may check an answer' using errcode = '42501';
  end if;

  select activity_attempts.activity_id into v_activity_id
  from app.activity_attempts
  where activity_attempts.attempt_id = p_attempt_id
    and activity_attempts.student_id = v_student_id
    and activity_attempts.status = 'in_progress'::app.attempt_status;

  if v_activity_id is null then
    raise exception 'No attempt of yours is in progress' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from app.activity_questions
    where activity_questions.activity_id = v_activity_id
      and activity_questions.question_id = p_question_id
  ) then
    raise exception 'That question is not part of this activity' using errcode = 'P0002';
  end if;

  select app.answer_is_correct(p_answer, questions.answer_key) into v_correct
  from app.questions
  where questions.question_id = p_question_id;

  insert into app.activity_responses (attempt_id, question_id, answer, is_correct, check_count)
  values (p_attempt_id, p_question_id, p_answer, v_correct, 1)
  on conflict (attempt_id, question_id) do update set
    answer = excluded.answer,
    is_correct = excluded.is_correct,
    check_count = activity_responses.check_count + 1
  returning activity_responses.check_count into v_checks;

  -- The explanation is released only once the learner has answered, and the
  -- hint is only ever reported as available here; its text comes from the hint
  -- function, when it is asked for.
  return query
  select
    v_correct,
    v_checks,
    questions.explanation,
    questions.hint is not null
  from app.questions
  where questions.question_id = p_question_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.activity_hint
-- ---------------------------------------------------------------------------
-- The membership guard was the one thing this function did not share with
-- app.check_activity_answer, and its absence showed: a question belonging to
-- some other activity returned no hint but still left an app.activity_responses
-- row against this attempt, and an identifier belonging to nothing at all
-- surfaced as a foreign key violation rather than the P0002 the route contract
-- expects. Both are now the same refusal the answer check gives.
create or replace function app.activity_hint(p_attempt_id uuid, p_question_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_activity_id uuid;
  v_hint text;
begin
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

  if v_student_id is null then
    raise exception 'Only a learner may ask for a hint' using errcode = '42501';
  end if;

  select activity_attempts.activity_id into v_activity_id
  from app.activity_attempts
  where activity_attempts.attempt_id = p_attempt_id
    and activity_attempts.student_id = v_student_id
    and activity_attempts.status = 'in_progress'::app.attempt_status;

  if v_activity_id is null then
    raise exception 'No attempt of yours is in progress' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from app.activity_questions
    where activity_questions.activity_id = v_activity_id
      and activity_questions.question_id = p_question_id
  ) then
    raise exception 'That question is not part of this activity' using errcode = 'P0002';
  end if;

  select questions.hint into v_hint
  from app.questions
  where questions.question_id = p_question_id;

  insert into app.activity_responses (attempt_id, question_id, hint_issued_at)
  values (p_attempt_id, p_question_id, now())
  on conflict (attempt_id, question_id) do update set
    hint_issued_at = coalesce(activity_responses.hint_issued_at, now());

  return v_hint;
end;
$$;

comment on function app.activity_hint(uuid, uuid) is
  'The authored hint for one question of the activity the calling learner''s own attempt belongs to. Refuses a question outside that activity, records that a hint was issued, and changes no score.';

-- ---------------------------------------------------------------------------
-- app.submit_activity_attempt
-- ---------------------------------------------------------------------------
create or replace function app.submit_activity_attempt(
  p_attempt_id uuid,
  p_answers jsonb default null,
  p_time_spent_seconds integer default 0
)
-- The attempt identifier is deliberately not returned: it is what the caller
-- passed in, and an OUT parameter of that name would collide with the column
-- of the same name inside the function ("column reference is ambiguous").
returns table (
  raw_score integer,
  max_score integer,
  score_percentage numeric,
  passed boolean,
  attempt_number integer,
  mastery_status app.mastery_band,
  previous_competency_score numeric,
  current_competency_score numeric,
  intervention_created boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_activity_id uuid;
  v_competency_id uuid;
  v_threshold integer;
  v_trigger integer;
  v_raw integer;
  v_max integer;
  v_percentage numeric(5,2);
  v_passed boolean;
  v_band app.mastery_band;
  v_previous numeric(5,2);
  v_current numeric(5,2);
  v_unsuccessful integer;
  v_teacher_admin_id uuid;
  v_intervention_created boolean := false;
  v_attempt_number integer;
begin
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

  if v_student_id is null then
    raise exception 'Only a learner may submit an activity' using errcode = '42501';
  end if;

  select activity_attempts.activity_id, activity_attempts.attempt_number
    into v_activity_id, v_attempt_number
  from app.activity_attempts
  where activity_attempts.attempt_id = p_attempt_id
    and activity_attempts.student_id = v_student_id
    and activity_attempts.status = 'in_progress'::app.attempt_status
  for update;

  if v_activity_id is null then
    raise exception 'No attempt of yours is in progress' using errcode = 'P0002';
  end if;

  -- Save whatever came with the submission, then grade every question in the
  -- activity. A question left blank is wrong, not absent.
  --
  -- The payload is collapsed to one row per question first. A submission that
  -- repeats a question would otherwise ask the ON CONFLICT clause to update one
  -- row twice in a single statement, which raises cardinality_violation and
  -- loses the whole submission. The last answer in the array wins, because that
  -- is the one the learner was looking at when they pressed submit.
  if p_answers is not null then
    with submitted as (
      select
        (answer.value ->> 'question_id')::uuid as question_id,
        answer.value -> 'answer' as answer,
        answer.answer_position
      from jsonb_array_elements(p_answers)
        with ordinality as answer(value, answer_position)
    ),
    latest as (
      select distinct on (submitted.question_id)
        submitted.question_id, submitted.answer, submitted.answer_position
      from submitted
      join app.activity_questions
        on activity_questions.question_id = submitted.question_id
       and activity_questions.activity_id = v_activity_id
      order by submitted.question_id, submitted.answer_position desc
    )
    insert into app.activity_responses (attempt_id, question_id, answer)
    select p_attempt_id, latest.question_id, latest.answer
    from latest
    on conflict (attempt_id, question_id) do update set answer = excluded.answer;
  end if;

  insert into app.activity_responses (attempt_id, question_id, answer)
  select p_attempt_id, activity_questions.question_id, null
  from app.activity_questions
  where activity_questions.activity_id = v_activity_id
  on conflict (attempt_id, question_id) do nothing;

  update app.activity_responses
  set is_correct = app.answer_is_correct(activity_responses.answer, questions.answer_key)
  from app.questions
  where questions.question_id = activity_responses.question_id
    and activity_responses.attempt_id = p_attempt_id;

  select
    count(*) filter (where activity_responses.is_correct)::integer,
    count(*)::integer
  into v_raw, v_max
  from app.activity_responses
  where activity_responses.attempt_id = p_attempt_id;

  -- An activity belongs to a module, and the module to a competency; the pass
  -- threshold is the activity's own.
  select learning_modules.competency_id, activities.mastery_threshold
    into v_competency_id, v_threshold
  from app.activities
  join app.learning_modules
    on learning_modules.module_id = activities.module_id
  where activities.activity_id = v_activity_id;

  v_percentage := coalesce(app.percentage_for(v_raw, v_max), 0);
  v_passed := v_percentage >= coalesce(v_threshold, 75);
  v_band := app.mastery_band_for(v_percentage);

  select competency_progress.current_score into v_previous
  from app.competency_progress
  where competency_progress.student_id = v_student_id
    and competency_progress.competency_id = v_competency_id;

  update app.activity_attempts
  set status = 'scored'::app.attempt_status,
      raw_score = v_raw,
      max_score = v_max,
      score_percentage = v_percentage,
      passed = v_passed,
      mastery_status = v_band,
      time_spent_seconds = greatest(coalesce(p_time_spent_seconds, 0), 0),
      submitted_at = now()
  where activity_attempts.attempt_id = p_attempt_id;

  -- The aggregate follows the most recent evidence, and counts the attempts
  -- that did not reach the threshold, which is what the intervention rule uses.
  insert into app.competency_progress
    (student_id, competency_id, current_score, mastery_band,
     attempt_count, unsuccessful_attempts, last_studied_at)
  values (
    v_student_id, v_competency_id, v_percentage, v_band,
    1, case when v_passed then 0 else 1 end, now()
  )
  on conflict (student_id, competency_id) do update set
    current_score = excluded.current_score,
    mastery_band = excluded.mastery_band,
    attempt_count = competency_progress.attempt_count + 1,
    unsuccessful_attempts = case
      when v_passed then 0
      else competency_progress.unsuccessful_attempts + 1
    end,
    last_studied_at = now()
  returning competency_progress.current_score, competency_progress.unsuccessful_attempts
    into v_current, v_unsuccessful;

  v_trigger := app.setting_integer('intervention.unsuccessful_attempts', 2);

  if not v_passed and v_unsuccessful >= v_trigger then
    update app.student_profiles
    set monitoring_status = 'needs_intervention'::app.monitoring_status
    where student_profiles.student_id = v_student_id;

    select sections.adviser_id into v_teacher_admin_id
    from app.student_profiles
    join app.sections on sections.section_id = student_profiles.section_id
    where student_profiles.student_id = v_student_id;

    if v_teacher_admin_id is not null and not exists (
      select 1 from app.interventions
      where interventions.student_id = v_student_id
        and interventions.competency_id = v_competency_id
        and interventions.status <> 'Resolved'::app.intervention_status
        and interventions.archived_at is null
    ) then
      insert into app.interventions
        (student_id, teacher_admin_id, competency_id, severity, status,
         intervention_type, incorrect_patterns, modules_attempted)
      values (
        v_student_id,
        v_teacher_admin_id,
        v_competency_id,
        case
          when v_current < 50 then 'HIGH'::app.intervention_severity
          when v_current < 80 then 'MEDIUM'::app.intervention_severity
          else 'LOW'::app.intervention_severity
        end,
        'Needs Intervention'::app.intervention_status,
        'Additional Exercise'::app.intervention_type,
        '[]'::jsonb,
        '[]'::jsonb
      );
      v_intervention_created := true;
    end if;
  end if;

  return query
  select
    v_raw, v_max, v_percentage, v_passed, v_attempt_number,
    v_band, v_previous, v_current, v_intervention_created;
end;
$$;

comment on function app.submit_activity_attempt(uuid, jsonb, integer) is
  'Grades the calling learner''s activity attempt deterministically however many times the payload repeats a question, updates their competency aggregate, and opens an intervention when the configured number of unsuccessful attempts is reached.';

-- ---------------------------------------------------------------------------
-- app.record_audit_event
-- ---------------------------------------------------------------------------
create or replace function app.record_audit_event(
  p_action text,
  p_target_type text,
  p_target_id uuid default null,
  p_request_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_audit_event_id uuid;
begin
  -- The role claim alone is not enough: a suspended Teacher/Administrator still
  -- carries it until the token expires, and nothing else in here would notice.
  if not app.is_teacher_admin() or not app.is_active_account() then
    raise exception 'Only a Teacher/Administrator may record an audit event'
      using errcode = '42501';
  end if;

  insert into app.audit_events
    (actor_user_id, actor_role, action, target_type, target_id, request_id, details)
  values (
    v_actor, 'teacher_admin'::app.user_role, p_action, p_target_type, p_target_id,
    p_request_id, coalesce(p_details, '{}'::jsonb)
  )
  returning audit_events.audit_event_id into v_audit_event_id;

  return v_audit_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.open_intervention
-- ---------------------------------------------------------------------------
create or replace function app.open_intervention(
  p_student_id uuid,
  p_competency_id uuid,
  p_severity app.intervention_severity,
  p_intervention_type app.intervention_type,
  p_educator_notes text default null,
  p_request_id text default null
)
returns app.interventions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher_admin_id uuid;
  v_actor uuid := (select auth.uid());
  v_row app.interventions;
begin
  select teacher_admin_profiles.teacher_admin_id into v_teacher_admin_id
  from app.teacher_admin_profiles
  where teacher_admin_profiles.user_id = v_actor
    and (select app.is_active_account());

  if v_teacher_admin_id is null or not app.is_teacher_admin() then
    raise exception 'Only a Teacher/Administrator may record an intervention'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from app.student_profiles
    where student_profiles.student_id = p_student_id
  ) then
    raise exception 'No such learner' using errcode = 'P0002';
  end if;

  select * into v_row
  from app.interventions
  where interventions.student_id = p_student_id
    and interventions.competency_id = p_competency_id
    and interventions.archived_at is null
    and interventions.status <> 'Resolved'::app.intervention_status
  for update;

  if found then
    -- Recording an action on an existing case, which is what the route
    -- contract asks for: it moves to In Progress and takes the educator's own
    -- words, rather than a second case appearing in the queue.
    update app.interventions
    set severity = p_severity,
        intervention_type = p_intervention_type,
        educator_notes = coalesce(p_educator_notes, interventions.educator_notes),
        status = 'In Progress'::app.intervention_status,
        teacher_admin_id = v_teacher_admin_id,
        recorded_at = now()
    where interventions.intervention_id = v_row.intervention_id
    returning * into v_row;
  else
    insert into app.interventions
      (student_id, teacher_admin_id, competency_id, severity, status,
       intervention_type, educator_notes)
    values (
      p_student_id, v_teacher_admin_id, p_competency_id, p_severity,
      'In Progress'::app.intervention_status, p_intervention_type, p_educator_notes
    )
    returning * into v_row;
  end if;

  perform app.record_audit_event(
    'intervention.recorded',
    'intervention',
    v_row.intervention_id,
    p_request_id,
    jsonb_build_object(
      'student_id', p_student_id,
      'competency_id', p_competency_id,
      'severity', p_severity::text,
      'intervention_type', p_intervention_type::text,
      'status', v_row.status::text
    )
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.update_intervention
-- ---------------------------------------------------------------------------
-- The documented lifecycle runs one way — Needs Intervention, In Progress,
-- Resolved — and a resolved case may reopen only to In Progress. The backward
-- step from In Progress to Needs Intervention was the one transition nothing
-- refused, and it is not a real one: a case an educator has taken up cannot
-- become untaken, and putting it back at the head of the queue would hide the
-- work already recorded against it.
create or replace function app.update_intervention(
  p_intervention_id uuid,
  p_severity app.intervention_severity default null,
  p_intervention_type app.intervention_type default null,
  p_educator_notes text default null,
  p_status app.intervention_status default null,
  p_reopen_reason text default null,
  p_request_id text default null
)
returns app.interventions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current app.intervention_status;
  v_next app.intervention_status;
  v_row app.interventions;
begin
  if not app.is_teacher_admin() or not app.is_active_account() then
    raise exception 'Only a Teacher/Administrator may update an intervention'
      using errcode = '42501';
  end if;

  select interventions.status into v_current
  from app.interventions
  where interventions.intervention_id = p_intervention_id
    and interventions.archived_at is null
  for update;

  if v_current is null then
    raise exception 'No such intervention' using errcode = 'P0002';
  end if;

  v_next := coalesce(p_status, v_current);

  if v_next <> v_current then
    if v_current = 'Needs Intervention'::app.intervention_status
       and v_next <> 'In Progress'::app.intervention_status then
      raise exception 'A case must be taken up before it can be resolved'
        using errcode = '23514';
    end if;

    if v_current = 'In Progress'::app.intervention_status
       and v_next = 'Needs Intervention'::app.intervention_status then
      raise exception 'A case that has been taken up cannot return to the queue'
        using errcode = '23514';
    end if;

    if v_current = 'Resolved'::app.intervention_status then
      if v_next <> 'In Progress'::app.intervention_status then
        raise exception 'A resolved case may only reopen to In Progress'
          using errcode = '23514';
      end if;
      if p_reopen_reason is null or btrim(p_reopen_reason) = '' then
        raise exception 'Reopening a resolved case needs a reason'
          using errcode = '23514';
      end if;
    end if;
  end if;

  update app.interventions
  set severity = coalesce(p_severity, interventions.severity),
      intervention_type = coalesce(p_intervention_type, interventions.intervention_type),
      educator_notes = coalesce(p_educator_notes, interventions.educator_notes),
      status = v_next,
      reopen_reason = case
        when v_current = 'Resolved'::app.intervention_status
         and v_next = 'In Progress'::app.intervention_status
          then p_reopen_reason
        else interventions.reopen_reason
      end,
      resolved_at = case
        when v_next = 'Resolved'::app.intervention_status
          then coalesce(interventions.resolved_at, now())
        else null
      end,
      recorded_at = now()
  where interventions.intervention_id = p_intervention_id
  returning * into v_row;

  perform app.record_audit_event(
    'intervention.updated',
    'intervention',
    p_intervention_id,
    p_request_id,
    jsonb_build_object(
      'from_status', v_current::text,
      'to_status', v_next::text,
      'severity', v_row.severity::text,
      'intervention_type', v_row.intervention_type::text,
      'notes_changed', p_educator_notes is not null
    )
  );

  return v_row;
end;
$$;

comment on function app.update_intervention(uuid, app.intervention_severity, app.intervention_type, text, app.intervention_status, text, text) is
  'Updates an intervention within the documented lifecycle, which runs one way. A case that has been taken up cannot return to the queue, and reopening a resolved case requires a reason. Every change is audited.';

-- ---------------------------------------------------------------------------
-- app.archive_intervention
-- ---------------------------------------------------------------------------
create or replace function app.archive_intervention(p_intervention_id uuid, p_request_id text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if not app.is_teacher_admin() or not app.is_active_account() then
    raise exception 'Only a Teacher/Administrator may archive an intervention'
      using errcode = '42501';
  end if;

  update app.interventions
  set archived_at = now()
  where interventions.intervention_id = p_intervention_id
    and interventions.archived_at is null;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return false;
  end if;

  perform app.record_audit_event(
    'intervention.archived', 'intervention', p_intervention_id, p_request_id, '{}'::jsonb
  );

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.set_account_status
-- ---------------------------------------------------------------------------
create or replace function app.set_account_status(
  p_user_id uuid,
  p_status app.account_status,
  p_request_id text default null
)
returns app.user_profiles
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_previous app.account_status;
  v_row app.user_profiles;
begin
  -- A suspended administrator must not be able to unsuspend anybody, least of
  -- all through a colleague's account they have already been locked out of.
  if not app.is_teacher_admin() or not app.is_active_account() then
    raise exception 'Only a Teacher/Administrator may change an account status'
      using errcode = '42501';
  end if;

  if p_user_id = v_actor then
    raise exception 'An administrator cannot change their own account status'
      using errcode = '42501';
  end if;

  select user_profiles.account_status into v_previous
  from app.user_profiles
  where user_profiles.user_id = p_user_id
  for update;

  if v_previous is null then
    raise exception 'No such account' using errcode = 'P0002';
  end if;

  update app.user_profiles
  set account_status = p_status,
      archived_at = case
        when p_status = 'archived'::app.account_status
          then coalesce(user_profiles.archived_at, now())
        else null
      end
  where user_profiles.user_id = p_user_id
  returning * into v_row;

  perform app.record_audit_event(
    'account.status_changed',
    'user_profile',
    p_user_id,
    p_request_id,
    jsonb_build_object('from', v_previous::text, 'to', p_status::text)
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.reset_diagnostic
-- ---------------------------------------------------------------------------
-- The reset now clears the baseline as well. app.submit_assessment_attempt
-- keeps whatever diagnostic_score is already stored, on the reasoning that a
-- later assessment must not overwrite the learner's starting point; leaving the
-- old value behind therefore meant the retake recorded no new baseline at all,
-- and every "growth since the diagnostic" figure kept measuring from a sitting
-- an educator had already declared void.
create or replace function app.reset_diagnostic(
  p_student_id uuid,
  p_reason text,
  p_request_id text default null
)
returns app.assessment_attempts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher_admin_id uuid;
  v_actor uuid := (select auth.uid());
  v_attempt app.assessment_attempts;
  v_assessment_id uuid;
begin
  select teacher_admin_profiles.teacher_admin_id into v_teacher_admin_id
  from app.teacher_admin_profiles
  where teacher_admin_profiles.user_id = v_actor
    and (select app.is_active_account());

  if v_teacher_admin_id is null or not app.is_teacher_admin() then
    raise exception 'Only a Teacher/Administrator may reset a diagnostic'
      using errcode = '42501';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'A diagnostic reset needs a reason' using errcode = '23514';
  end if;

  select assessment_attempts.* into v_attempt
  from app.assessment_attempts
  join app.assessments
    on assessments.assessment_id = assessment_attempts.assessment_id
  where assessment_attempts.student_id = p_student_id
    and assessments.assessment_type = 'diagnostic'::app.assessment_type
    and assessment_attempts.status <> 'voided'::app.attempt_status
  order by assessment_attempts.started_at desc
  limit 1
  for update of assessment_attempts;

  if v_attempt.attempt_id is null then
    raise exception 'That learner has no diagnostic attempt to reset'
      using errcode = 'P0002';
  end if;

  v_assessment_id := v_attempt.assessment_id;

  update app.assessment_attempts
  set status = 'voided'::app.attempt_status,
      voided_reason = p_reason,
      -- voided_by references app.teacher_admin_profiles, not the Auth user.
      voided_by = v_teacher_admin_id,
      voided_at = now()
  where assessment_attempts.attempt_id = v_attempt.attempt_id
  returning * into v_attempt;

  update app.student_profiles
  set diagnostic_status = 'not_started'::app.diagnostic_status
  where student_profiles.student_id = p_student_id;

  -- The baseline belonged to the sitting that has just been voided, so it goes
  -- with it. The current score and the band stay, because they describe work
  -- the learner has genuinely done since.
  update app.competency_progress
  set diagnostic_score = null
  where competency_progress.student_id = p_student_id
    and competency_progress.diagnostic_score is not null;

  insert into app.reassessment_authorizations
    (student_id, assessment_id, authorized_by, reason)
  values (p_student_id, v_assessment_id, v_teacher_admin_id, p_reason);

  perform app.record_audit_event(
    'assessment.diagnostic_reset',
    'assessment_attempt',
    v_attempt.attempt_id,
    p_request_id,
    jsonb_build_object(
      'student_id', p_student_id,
      'assessment_id', v_assessment_id,
      'reason', p_reason
    )
  );

  return v_attempt;
end;
$$;

comment on function app.reset_diagnostic(uuid, text, text) is
  'Voids a learner''s latest diagnostic attempt with a required reason, returns them to not_started, clears the baseline that attempt recorded, authorises a fresh sitting and audits the whole thing in one transaction.';
