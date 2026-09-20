-- Activity attempts read and grade their own frozen question set.
--
-- The columns arrived in the previous migration; this is what fills them and
-- what stops the four learner-facing functions from ever consulting the
-- authoring tables again mid-attempt.
--
-- The shape deliberately mirrors `app.start_assessment_attempt` and
-- `app.submit_assessment_attempt`, because the two attempt kinds should not
-- differ in how much they trust content that can change underneath them.

begin;

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
  v_member_count integer;
  v_deliverable_count integer;
  v_snapshot_count integer;
  v_recorded integer;
begin
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

  if v_student_id is null then
    raise exception 'Only a learner may attempt an activity' using errcode = '42501';
  end if;

  -- An activity reaches a learner only when its module and that module's
  -- competency are published too: that is what `activities_select` says, and
  -- this function runs as the definer, so it has to say it as well. Checking
  -- only `activities.status` is what let a learner start an activity whose
  -- module had been unpublished, be delivered nothing, and be scored zero.
  select activities.version into v_version
  from app.activities
  join app.learning_modules
    on learning_modules.module_id = activities.module_id
  join app.competencies
    on competencies.competency_id = learning_modules.competency_id
  where activities.activity_id = p_activity_id
    and activities.status = 'published'::app.publication_status
    and learning_modules.status = 'published'::app.publication_status
    and competencies.status = 'published'::app.publication_status;

  if v_version is null then
    raise exception 'No such published activity' using errcode = 'P0002';
  end if;

  select * into v_row
  from app.activity_attempts
  where activity_attempts.student_id = v_student_id
    and activity_attempts.activity_id = p_activity_id
    and activity_attempts.status = 'in_progress'::app.attempt_status
  for update;

  if found then
    if v_row.question_snapshot_count is not null then
      return v_row;
    end if;

    -- An attempt opened before this migration has no frozen question set. It
    -- cannot be graded safely, because there is nothing that says what it was
    -- started with.
    --
    -- When nothing has been recorded against it — no answer checked, no hint
    -- taken — there is no learner work to protect, so it is given a snapshot
    -- now and carries on. When there is, it is refused: grading it against
    -- whatever the activity says today is exactly the outcome the snapshot
    -- exists to prevent, and a teacher has to decide what to do with it.
    select count(*)::integer into v_recorded
    from app.activity_responses
    where activity_responses.attempt_id = v_row.attempt_id;

    if v_recorded > 0 then
      raise exception 'This attempt has no frozen question set' using errcode = 'P0004';
    end if;
  end if;

  -- Freeze the membership. The share locks stop a teacher's membership
  -- replacement from interleaving with the copy.
  perform 1
  from app.activity_questions as membership
  join app.questions on questions.question_id = membership.question_id
  join app.competencies on competencies.competency_id = questions.competency_id
  where membership.activity_id = p_activity_id
  for share of membership, questions, competencies;

  select count(*)::integer,
         count(*) filter (
           where questions.status = 'published'::app.publication_status
             and competencies.status = 'published'::app.publication_status
         )::integer
  into v_member_count, v_deliverable_count
  from app.activity_questions as membership
  join app.questions on questions.question_id = membership.question_id
  join app.competencies on competencies.competency_id = questions.competency_id
  where membership.activity_id = p_activity_id;

  if v_member_count = 0 or v_deliverable_count <> v_member_count then
    raise exception 'The activity has no complete published question set'
      using errcode = 'P0004';
  end if;

  if v_row.attempt_id is null then
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
  end if;

  insert into app.activity_responses
    (attempt_id, question_id, question_version, delivered_position,
     delivered_competency_id, delivered_payload, grading_answer_key,
     delivered_explanation, delivered_hint)
  select v_row.attempt_id, questions.question_id, questions.version,
         membership.position, questions.competency_id,
         jsonb_build_object('id', questions.question_id,
           'competency_id', questions.competency_id,
           'competency_name', competencies.name, 'text', questions.prompt,
           'type', questions.question_type, 'choices', questions.choices,
           'difficulty', questions.difficulty,
           'visual_aid_description', questions.visual_aid_description),
         questions.answer_key, questions.explanation, questions.hint
  from app.activity_questions as membership
  join app.questions on questions.question_id = membership.question_id
  join app.competencies on competencies.competency_id = questions.competency_id
  where membership.activity_id = p_activity_id
  order by membership.position;

  get diagnostics v_snapshot_count = row_count;
  if v_snapshot_count <> v_member_count then
    raise exception 'The activity question snapshot is incomplete' using errcode = 'P0004';
  end if;

  update app.activity_attempts
  set question_snapshot_created_at = now(), question_snapshot_count = v_snapshot_count
  where activity_attempts.attempt_id = v_row.attempt_id
  returning * into v_row;

  return v_row;
end;
$$;

comment on function app.start_activity_attempt(uuid) is
  'Starts or resumes one learner''s attempt, freezing the activity''s questions and their keys against it. Refuses an activity whose module or competency is not published, and refuses to resume a pre-snapshot attempt that already holds learner work.';

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
  v_key jsonb;
  v_explanation text;
  v_has_hint boolean;
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

  -- Membership, the key, the explanation and the hint all come from the
  -- attempt's own snapshot row. Reading them from the authoring tables is what
  -- let an answer already committed to be re-judged against a key edited since,
  -- and let a question archived mid-attempt stop being part of the activity the
  -- learner was sitting.
  select responses.grading_answer_key, responses.delivered_explanation,
         responses.delivered_hint is not null
  into v_key, v_explanation, v_has_hint
  from app.activity_responses as responses
  join app.activity_attempts as attempts
    on attempts.attempt_id = responses.attempt_id
  where responses.attempt_id = p_attempt_id
    and responses.question_id = p_question_id
    and attempts.student_id = v_student_id
    and attempts.status = 'in_progress'::app.attempt_status
    and responses.delivered_position is not null;

  if not found then
    raise exception 'That question is not part of this attempt' using errcode = 'P0002';
  end if;

  v_correct := app.answer_is_correct(p_answer, v_key);

  update app.activity_responses
  set answer = p_answer,
      is_correct = v_correct,
      check_count = activity_responses.check_count + 1
  where activity_responses.attempt_id = p_attempt_id
    and activity_responses.question_id = p_question_id
  returning activity_responses.check_count into v_checks;

  -- The explanation is released only once the learner has answered, and the
  -- hint is only ever reported as available here; its text comes from the hint
  -- function, when it is asked for.
  return query select v_correct, v_checks, v_explanation, v_has_hint;
end;
$$;

comment on function app.check_activity_answer(uuid, uuid, jsonb) is
  'Judges one answer against the key frozen for this attempt, never the live question bank, and returns the explanation delivered with it.';

-- ---------------------------------------------------------------------------
-- app.activity_hint
-- ---------------------------------------------------------------------------
create or replace function app.activity_hint(p_attempt_id uuid, p_question_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_hint text;
begin
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

  if v_student_id is null then
    raise exception 'Only a learner may ask for a hint' using errcode = '42501';
  end if;

  -- `found` rather than a flag selected into a variable: a SELECT INTO that
  -- matches nothing sets its targets to NULL, so a boolean initialised to
  -- false would come back NULL and `if not v_found` would be NULL, which is
  -- not true — and the guard would never fire.
  select responses.delivered_hint
  into v_hint
  from app.activity_responses as responses
  join app.activity_attempts as attempts
    on attempts.attempt_id = responses.attempt_id
  where responses.attempt_id = p_attempt_id
    and responses.question_id = p_question_id
    and attempts.student_id = v_student_id
    and attempts.status = 'in_progress'::app.attempt_status
    and responses.delivered_position is not null;

  if not found then
    raise exception 'That question is not part of this attempt' using errcode = 'P0002';
  end if;

  update app.activity_responses
  set hint_issued_at = coalesce(activity_responses.hint_issued_at, now())
  where activity_responses.attempt_id = p_attempt_id
    and activity_responses.question_id = p_question_id;

  return v_hint;
end;
$$;

comment on function app.activity_hint(uuid, uuid) is
  'The hint delivered with one question of the calling learner''s own in-progress attempt. Refuses a question outside that attempt, records that a hint was issued, and changes no score.';

-- ---------------------------------------------------------------------------
-- app.submit_activity_attempt
-- ---------------------------------------------------------------------------
-- Only the grading half changes: the answers are saved against the snapshot
-- rows, every snapshot row is graded against its own frozen key, and the count
-- of rows graded has to equal the count frozen at the start. Everything after
-- the score — the competency aggregate, the intervention rule — is untouched.
create or replace function app.submit_activity_attempt(
  p_attempt_id uuid,
  p_answers jsonb default null,
  p_time_spent_seconds integer default 0
)
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
  v_snapshot_count integer;
  v_graded integer;
begin
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

  if v_student_id is null then
    raise exception 'Only a learner may submit an activity' using errcode = '42501';
  end if;

  select activity_attempts.activity_id, activity_attempts.attempt_number,
         activity_attempts.question_snapshot_count
    into v_activity_id, v_attempt_number, v_snapshot_count
  from app.activity_attempts
  where activity_attempts.attempt_id = p_attempt_id
    and activity_attempts.student_id = v_student_id
    and activity_attempts.status = 'in_progress'::app.attempt_status
  for update;

  if v_activity_id is null then
    raise exception 'No attempt of yours is in progress' using errcode = 'P0002';
  end if;

  if v_snapshot_count is null then
    raise exception 'This attempt has no frozen question set' using errcode = 'P0004';
  end if;

  -- Save whatever came with the submission against the snapshot rows. A
  -- question the attempt was never given is ignored rather than inserted: it
  -- is not part of what this learner was asked.
  --
  -- The payload is collapsed to one row per question first. A submission that
  -- repeats a question would otherwise ask one row to be updated twice in a
  -- single statement, which raises cardinality_violation and loses the whole
  -- submission. The last answer in the array wins, because that is the one the
  -- learner was looking at when they pressed submit.
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
        submitted.question_id, submitted.answer
      from submitted
      order by submitted.question_id, submitted.answer_position desc
    )
    update app.activity_responses
    set answer = latest.answer
    from latest
    where activity_responses.attempt_id = p_attempt_id
      and activity_responses.question_id = latest.question_id
      and activity_responses.delivered_position is not null;
  end if;

  -- Every question the attempt was given is graded against the key frozen with
  -- it. A question left blank is wrong, not absent.
  update app.activity_responses
  set is_correct = app.answer_is_correct(
        activity_responses.answer, activity_responses.grading_answer_key
      )
  where activity_responses.attempt_id = p_attempt_id
    and activity_responses.delivered_position is not null;

  get diagnostics v_graded = row_count;
  if v_graded <> v_snapshot_count then
    raise exception 'The attempt was not graded against its whole question set'
      using errcode = 'P0004';
  end if;

  select
    count(*) filter (where activity_responses.is_correct)::integer,
    count(*)::integer
  into v_raw, v_max
  from app.activity_responses
  where activity_responses.attempt_id = p_attempt_id
    and activity_responses.delivered_position is not null;

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
  'Grades one attempt against the keys frozen when it began, refusing unless every frozen question was graded. Content edited during the attempt cannot change its score.';

commit;
