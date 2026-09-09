-- MathSmart Phase 5 — assessment attempts and deterministic grading.
--
-- Why grading lives in the database
-- ---------------------------------
-- app.questions.answer_key is withheld from `authenticated` by a column
-- privilege, so an ordinary connection cannot read it — that is the point of
-- the column grant, and it is what keeps an answer key out of a response even
-- if a route is written carelessly. Grading has to read it, so grading happens
-- here, in SECURITY DEFINER functions, and the key never leaves the database.
--
-- The same reasoning as the module write functions applies: every learner
-- record table stays SELECT-only for `authenticated`, the learner is derived
-- from auth.uid() rather than passed in, search_path is empty, EXECUTE is
-- revoked from PUBLIC, and app is not exposed through the Data API.
--
-- Nothing here is advisory. No score, band, path item or status depends on
-- Groq; all of it is a function of the stored answers and the stored key.

-- ---------------------------------------------------------------------------
-- Answer comparison
-- ---------------------------------------------------------------------------
-- A learner's answer arrives as jsonb and the key is stored as jsonb. Two
-- answers match when they are the same number, or the same text ignoring case
-- and surrounding space. An answer key may also be an array, which means any
-- one of those values is accepted.
create function app.numeric_of(p_value jsonb)
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
  when invalid_text_representation then
    return null;
end;
$$;

comment on function app.numeric_of(jsonb) is
  'The numeric value of a JSON scalar, or NULL when it is not a number. Used so 4.20 and 4.2 grade alike.';

create function app.text_of(p_value jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_value #>> '{}', '')));
$$;

comment on function app.text_of(jsonb) is
  'The comparable text of a JSON scalar: trimmed and lower-cased.';

create function app.answers_match(p_answer jsonb, p_expected jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
           when p_answer is null or p_expected is null then false
           when app.numeric_of(p_answer) is not null
            and app.numeric_of(p_expected) is not null
             then app.numeric_of(p_answer) = app.numeric_of(p_expected)
           else app.text_of(p_answer) = app.text_of(p_expected)
         end;
$$;

comment on function app.answers_match(jsonb, jsonb) is
  'True when one answer equals one expected value, numerically where both are numbers and otherwise as trimmed lower-case text.';

create function app.answer_is_correct(p_answer jsonb, p_answer_key jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
           when p_answer is null or p_answer_key is null then false
           when jsonb_typeof(p_answer_key) = 'array' then exists (
             select 1
             from jsonb_array_elements(p_answer_key) as accepted
             where app.answers_match(p_answer, accepted)
           )
           else app.answers_match(p_answer, p_answer_key)
         end;
$$;

comment on function app.answer_is_correct(jsonb, jsonb) is
  'The only definition of a correct MathSmart answer. An array answer key means any one of its values is accepted. Deterministic and Groq-independent.';

revoke all on function app.numeric_of(jsonb) from public;
revoke all on function app.text_of(jsonb) from public;
revoke all on function app.answers_match(jsonb, jsonb) from public;
revoke all on function app.answer_is_correct(jsonb, jsonb) from public;
grant execute on function app.numeric_of(jsonb) to authenticated, service_role;
grant execute on function app.text_of(jsonb) to authenticated, service_role;
grant execute on function app.answers_match(jsonb, jsonb) to authenticated, service_role;
grant execute on function app.answer_is_correct(jsonb, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.start_assessment_attempt
-- ---------------------------------------------------------------------------
-- Starting is resuming when an attempt is already open. The partial unique
-- index already forbids a second attempt in progress; this returns the open one
-- rather than colliding with it, because a learner refreshing a page is not an
-- error.
create function app.start_assessment_attempt(p_assessment_id uuid)
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
  where student_profiles.user_id = (select auth.uid());

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

comment on function app.start_assessment_attempt(uuid) is
  'Starts the calling learner''s attempt, or returns the one already in progress. The learner comes from auth.uid().';

revoke all on function app.start_assessment_attempt(uuid) from public;
grant execute on function app.start_assessment_attempt(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.save_assessment_answers
-- ---------------------------------------------------------------------------
-- Autosave. Answers for questions that are not in this assessment are ignored
-- rather than rejected, so a stale client cannot fail a whole save; is_correct
-- stays NULL, because nothing is graded before submission.
create function app.save_assessment_answers(p_attempt_id uuid, p_answers jsonb)
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
  where student_profiles.user_id = (select auth.uid());

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
      answer.value -> 'answer' as answer
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as answer
    where answer.value ? 'question_id'
  ),
  belonging as (
    select submitted.question_id, submitted.answer
    from submitted
    join app.assessment_questions
      on assessment_questions.question_id = submitted.question_id
     and assessment_questions.assessment_id = v_assessment_id
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
  'Saves answers to the calling learner''s own attempt while it is in progress. Grades nothing.';

revoke all on function app.save_assessment_answers(uuid, jsonb) from public;
grant execute on function app.save_assessment_answers(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.submit_assessment_attempt
-- ---------------------------------------------------------------------------
-- One call, one transaction: save what is left, grade every response against
-- the stored key, write the per-competency results, refresh the aggregate,
-- rebuild the targeted path, and finalise the attempt.
--
-- The path rule: a competency the learner has not mastered earns an item,
-- ordered by how far behind it is, pointing at the first published module of
-- that competency. The first item is available and the rest are locked, so the
-- learner is given one thing to do next rather than a list.
create function app.submit_assessment_attempt(p_attempt_id uuid, p_answers jsonb default null)
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
  where student_profiles.user_id = (select auth.uid());

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

  -- The targeted path is rebuilt from the result that has just been recorded,
  -- so it always reflects the most recent evidence.
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
  'Grades the calling learner''s attempt deterministically against the stored answer keys and writes the responses, per-competency results, aggregate progress and targeted path in one transaction.';

revoke all on function app.submit_assessment_attempt(uuid, jsonb) from public;
grant execute on function app.submit_assessment_attempt(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.authorize_reassessment
-- ---------------------------------------------------------------------------
-- A Teacher/Administrator authorising a learner to sit an assessment again.
-- app.reassessment_authorizations is SELECT-only for `authenticated` for the
-- same reason as the learner tables: an authorization is a decision, and a
-- decision must not be writable by whoever benefits from it.
--
-- The educator is resolved from auth.uid() rather than passed in, so the record
-- names whoever actually made the call. The audit row is written here, in the
-- same transaction, because an authorization that is not audited is not one.
create function app.authorize_reassessment(
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
  where teacher_admin_profiles.user_id = v_actor;

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

comment on function app.authorize_reassessment(uuid, uuid, text, timestamptz, text) is
  'Records a Teacher/Administrator''s reassessment authorization and its audit event in one transaction. The educator comes from auth.uid().';

revoke all on function app.authorize_reassessment(uuid, uuid, text, timestamptz, text)
  from public;
grant execute on function app.authorize_reassessment(uuid, uuid, text, timestamptz, text)
  to authenticated, service_role;
