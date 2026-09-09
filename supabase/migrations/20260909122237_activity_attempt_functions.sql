-- MathSmart Phase 5 — activity attempts, answer checks, hints and interventions.
--
-- Same reasoning as the assessment functions. An activity checks an answer
-- while the learner is still working, which means reading answer_key, and it
-- offers an authored hint, which means reading hint — both columns the
-- `authenticated` role deliberately cannot select. So both live here, and each
-- returns only what the learner is allowed to see: a verdict, an explanation
-- once the answer is in, and the hint they asked for.
--
-- The configurable rules — the activity pass threshold and the automatic
-- intervention trigger — are read from app.system_settings with the documented
-- defaults as a fallback, so the behaviour is deterministic whether or not a
-- Teacher/Administrator has ever changed them. Groq is not consulted anywhere.

-- ---------------------------------------------------------------------------
-- Configured rules
-- ---------------------------------------------------------------------------
create function app.setting_integer(p_key text, p_default integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value jsonb;
begin
  select system_settings.setting_value into v_value
  from app.system_settings
  where system_settings.setting_key = p_key;

  if v_value is null or jsonb_typeof(v_value) <> 'number' then
    return p_default;
  end if;
  return (v_value #>> '{}')::integer;
exception
  when invalid_text_representation then
    return p_default;
end;
$$;

comment on function app.setting_integer(text, integer) is
  'A whole-number system setting, or the documented default when it is unset or not a number. Keeps the deterministic rules working on a fresh database.';

revoke all on function app.setting_integer(text, integer) from public;
grant execute on function app.setting_integer(text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.start_activity_attempt
-- ---------------------------------------------------------------------------
create function app.start_activity_attempt(p_activity_id uuid)
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
  where student_profiles.user_id = (select auth.uid());

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

comment on function app.start_activity_attempt(uuid) is
  'Starts the calling learner''s activity attempt, or returns the one already in progress. The attempt number counts their own earlier attempts.';

revoke all on function app.start_activity_attempt(uuid) from public;
grant execute on function app.start_activity_attempt(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.check_activity_answer
-- ---------------------------------------------------------------------------
-- Immediate feedback on one answer, without finalising anything. The verdict
-- and the authored explanation come back; the answer key does not, and the
-- check count is kept so the API can report how many times this question has
-- been tried.
create function app.check_activity_answer(
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
  where student_profiles.user_id = (select auth.uid());

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

comment on function app.check_activity_answer(uuid, uuid, jsonb) is
  'Deterministic immediate feedback for one activity answer. Returns the verdict, the authored explanation and whether a hint exists — never the answer key.';

revoke all on function app.check_activity_answer(uuid, uuid, jsonb) from public;
grant execute on function app.check_activity_answer(uuid, uuid, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.activity_hint
-- ---------------------------------------------------------------------------
-- The authored hint, and a record that it was issued. Asking for a hint changes
-- nothing about scoring; the timestamp exists so the workflow can show that one
-- was taken.
create function app.activity_hint(p_attempt_id uuid, p_question_id uuid)
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
  where student_profiles.user_id = (select auth.uid());

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

  select questions.hint into v_hint
  from app.questions
  join app.activity_questions
    on activity_questions.question_id = questions.question_id
   and activity_questions.activity_id = v_activity_id
  where questions.question_id = p_question_id;

  insert into app.activity_responses (attempt_id, question_id, hint_issued_at)
  values (p_attempt_id, p_question_id, now())
  on conflict (attempt_id, question_id) do update set
    hint_issued_at = coalesce(activity_responses.hint_issued_at, now());

  return v_hint;
end;
$$;

comment on function app.activity_hint(uuid, uuid) is
  'The authored hint for one question in the calling learner''s own attempt. Records that a hint was issued and changes no score.';

revoke all on function app.activity_hint(uuid, uuid) from public;
grant execute on function app.activity_hint(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.submit_activity_attempt
-- ---------------------------------------------------------------------------
-- Finalises the attempt and applies the deterministic rules in one transaction:
-- the score, the pass decision against the activity's own threshold, the
-- learner's aggregate for the competency, and the automatic intervention when
-- the configured number of unsuccessful attempts is reached.
--
-- The intervention needs an educator to own the case, and the only one the
-- database can name deterministically is the adviser of the learner's section.
-- Without one, the learner is still flagged for monitoring; a case is not
-- invented against an educator who was never chosen.
create function app.submit_activity_attempt(
  p_attempt_id uuid,
  p_answers jsonb default null,
  p_time_spent_seconds integer default 0
)
returns table (
  attempt_id uuid,
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
  where student_profiles.user_id = (select auth.uid());

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
  if p_answers is not null then
    insert into app.activity_responses (attempt_id, question_id, answer)
    select
      p_attempt_id,
      (answer.value ->> 'question_id')::uuid,
      answer.value -> 'answer'
    from jsonb_array_elements(p_answers) as answer
    join app.activity_questions
      on activity_questions.question_id = (answer.value ->> 'question_id')::uuid
     and activity_questions.activity_id = v_activity_id
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
    p_attempt_id, v_raw, v_max, v_percentage, v_passed, v_attempt_number,
    v_band, v_previous, v_current, v_intervention_created;
end;
$$;

comment on function app.submit_activity_attempt(uuid, jsonb, integer) is
  'Grades the calling learner''s activity attempt deterministically, updates their competency aggregate, and opens an intervention when the configured number of unsuccessful attempts is reached.';

revoke all on function app.submit_activity_attempt(uuid, jsonb, integer) from public;
grant execute on function app.submit_activity_attempt(uuid, jsonb, integer)
  to authenticated, service_role;
