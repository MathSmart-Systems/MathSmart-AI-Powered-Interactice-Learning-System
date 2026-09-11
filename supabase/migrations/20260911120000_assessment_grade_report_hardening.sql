-- Enforce learner grade eligibility and derive scored reports in the database.
-- This is a forward migration: the snapshot/idempotency migrations remain intact.

begin;

create or replace function app.start_assessment_attempt(p_assessment_id uuid)
returns app.assessment_attempts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_student_grade_id uuid;
  v_assessment_grade_id uuid;
  v_version integer;
  v_assessment_type app.assessment_type;
  v_authorization_id uuid;
  v_consumed uuid;
  v_snapshot_count integer;
  v_member_count integer;
  v_row app.assessment_attempts;
begin
  select student_profiles.student_id, student_profiles.grade_id
  into v_student_id, v_student_grade_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account())
  for update;

  if v_student_id is null then
    raise exception 'Only a learner may attempt an assessment' using errcode = '42501';
  end if;

  -- Resolve and authorize the published assessment before looking for an open
  -- attempt. This prevents a learner from resuming an otherwise valid attempt
  -- after their grade changes, and gives the mismatch a stable contract.
  select assessments.grade_id, assessments.version, assessments.assessment_type
  into v_assessment_grade_id, v_version, v_assessment_type
  from app.assessments
  where assessments.assessment_id = p_assessment_id
    and assessments.status = 'published'::app.publication_status
  for share;

  if v_version is null then
    raise exception 'No such published assessment' using errcode = 'P0002';
  end if;

  select * into v_row
  from app.assessment_attempts
  where assessment_attempts.student_id = v_student_id
    and assessment_attempts.assessment_id = p_assessment_id
    and assessment_attempts.status = 'in_progress'::app.attempt_status
  for update;

  if found then
    if v_student_grade_id is distinct from v_row.assessment_grade_id_snapshot then
      raise exception 'This assessment is not available for your grade'
        using errcode = 'P0001';
    end if;

    if v_row.question_snapshot_created_at is null
       or v_row.question_snapshot_count is null
       or v_row.question_snapshot_count < 1
       or (
         select count(*)
         from app.assessment_responses
         where assessment_responses.attempt_id = v_row.attempt_id
           and assessment_responses.question_version is not null
           and assessment_responses.delivered_position is not null
           and assessment_responses.delivered_competency_id is not null
           and assessment_responses.delivered_payload is not null
           and assessment_responses.grading_answer_key is not null
       ) <> v_row.question_snapshot_count then
      raise exception 'The open assessment attempt has no complete question snapshot'
        using errcode = 'P0004';
    end if;
    v_row.resumed := true;
    return v_row;
  end if;

  if v_student_grade_id is distinct from v_assessment_grade_id then
    raise exception 'This assessment is not available for your grade'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from app.assessment_attempts
    where assessment_attempts.student_id = v_student_id
      and assessment_attempts.assessment_id = p_assessment_id
  ) then
    select reassessment_authorizations.authorization_id
    into v_authorization_id
    from app.reassessment_authorizations
    where reassessment_authorizations.student_id = v_student_id
      and reassessment_authorizations.assessment_id = p_assessment_id
      and reassessment_authorizations.consumed_at is null
      and reassessment_authorizations.superseded_at is null
      and (reassessment_authorizations.expires_at is null
           or reassessment_authorizations.expires_at > now())
    order by reassessment_authorizations.granted_at
    limit 1
    for update;

    if v_authorization_id is null then
      raise exception 'A reassessment needs an authorization' using errcode = '42501';
    end if;
  end if;

  perform 1
  from app.assessment_questions as membership
  join app.questions on questions.question_id = membership.question_id
  join app.competencies on competencies.competency_id = questions.competency_id
  where membership.assessment_id = p_assessment_id
  for share of membership, questions, competencies;

  select count(*)::integer,
         count(*) filter (
           where questions.status = 'published'::app.publication_status
             and competencies.status = 'published'::app.publication_status
         )::integer
  into v_member_count, v_snapshot_count
  from app.assessment_questions as membership
  join app.questions on questions.question_id = membership.question_id
  join app.competencies on competencies.competency_id = questions.competency_id
  where membership.assessment_id = p_assessment_id;

  if v_member_count = 0 or v_snapshot_count <> v_member_count then
    raise exception 'The assessment has no complete published question set'
      using errcode = 'P0004';
  end if;

  insert into app.assessment_attempts
    (assessment_id, student_id, assessment_version, assessment_type_snapshot,
     assessment_grade_id_snapshot, assessment_payload)
  select assessments.assessment_id, v_student_id, assessments.version,
         assessments.assessment_type, assessments.grade_id,
         jsonb_build_object('id', assessments.assessment_id,
           'title', assessments.title, 'type', assessments.assessment_type,
           'duration_minutes', assessments.duration_minutes)
  from app.assessments
  where assessments.assessment_id = p_assessment_id
  returning * into v_row;

  insert into app.assessment_responses
    (attempt_id, question_id, question_version, delivered_position,
     delivered_competency_id, delivered_payload, grading_answer_key)
  select v_row.attempt_id, questions.question_id, questions.version,
         membership.position, questions.competency_id,
         jsonb_build_object('id', questions.question_id,
           'competency_id', questions.competency_id,
           'competency_name', competencies.name, 'text', questions.prompt,
           'type', questions.question_type, 'choices', questions.choices,
           'difficulty', questions.difficulty,
           'visual_aid_description', questions.visual_aid_description),
         questions.answer_key
  from app.assessment_questions as membership
  join app.questions on questions.question_id = membership.question_id
  join app.competencies on competencies.competency_id = questions.competency_id
  where membership.assessment_id = p_assessment_id
  order by membership.position;

  get diagnostics v_snapshot_count = row_count;
  if v_snapshot_count <> v_member_count then
    raise exception 'The assessment question snapshot is incomplete' using errcode = 'P0004';
  end if;

  update app.assessment_attempts
  set question_snapshot_created_at = now(), question_snapshot_count = v_snapshot_count
  where assessment_attempts.attempt_id = v_row.attempt_id
  returning * into v_row;

  if v_authorization_id is not null then
    update app.reassessment_authorizations
    set consumed_at = now(), consumed_attempt_id = v_row.attempt_id
    where reassessment_authorizations.authorization_id = v_authorization_id
      and reassessment_authorizations.consumed_at is null
    returning reassessment_authorizations.authorization_id into v_consumed;
    if v_consumed is null then
      raise exception 'A reassessment needs an authorization' using errcode = '42501';
    end if;
  end if;

  update app.student_profiles
  set diagnostic_status = 'in_progress'::app.diagnostic_status
  where student_profiles.student_id = v_student_id
    and v_assessment_type = 'diagnostic'::app.assessment_type;

  return v_row;
end;
$$;

-- Report creation is part of scoring. Serializing submissions for one learner
-- keeps the mutable current learning path deterministic while each attempt's
-- report is copied into its immutable result_payload in the same transaction.
create or replace function app.submit_assessment_attempt(
  p_attempt_id uuid,
  p_answers jsonb default null
)
returns app.assessment_attempts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_student_grade_id uuid;
  v_assessment_grade_id uuid;
  v_assessment_type app.assessment_type;
  v_snapshot_count integer;
  v_raw integer;
  v_max integer;
  v_graded integer;
  v_payload jsonb;
  v_row app.assessment_attempts;
begin
  select student_profiles.student_id, student_profiles.grade_id
  into v_student_id, v_student_grade_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account())
  for update;

  if v_student_id is null then
    raise exception 'Only a learner may submit an assessment' using errcode = '42501';
  end if;

  select assessment_attempts.assessment_type_snapshot,
         assessment_attempts.assessment_grade_id_snapshot,
         assessment_attempts.question_snapshot_count
  into v_assessment_type, v_assessment_grade_id, v_snapshot_count
  from app.assessment_attempts
  where assessment_attempts.attempt_id = p_attempt_id
    and assessment_attempts.student_id = v_student_id
    and assessment_attempts.status = 'in_progress'::app.attempt_status
  for update;

  if not found then
    raise exception 'No attempt of yours is in progress' using errcode = 'P0002';
  end if;

  if v_student_grade_id is distinct from v_assessment_grade_id then
    raise exception 'This assessment is not available for your grade'
      using errcode = 'P0001';
  end if;

  if v_assessment_type is null or v_snapshot_count is null or v_snapshot_count < 1 then
    raise exception 'The assessment attempt has no complete question snapshot'
      using errcode = 'P0004';
  end if;

  if p_answers is not null then
    perform app.save_assessment_answers(p_attempt_id, p_answers);
  end if;

  update app.assessment_responses
  set is_correct = app.answer_is_correct(answer, grading_answer_key)
  where assessment_responses.attempt_id = p_attempt_id
    and assessment_responses.question_version is not null
    and assessment_responses.delivered_position is not null
    and assessment_responses.delivered_competency_id is not null
    and assessment_responses.delivered_payload is not null
    and assessment_responses.grading_answer_key is not null;

  get diagnostics v_graded = row_count;
  if v_graded <> v_snapshot_count then
    raise exception 'The assessment attempt question snapshot is incomplete'
      using errcode = 'P0004';
  end if;

  insert into app.competency_results
    (attempt_id, competency_id, raw_score, max_score, percentage, mastery_band)
  select p_attempt_id, assessment_responses.delivered_competency_id,
         count(*) filter (where assessment_responses.is_correct)::integer,
         count(*)::integer,
         app.percentage_for(
           count(*) filter (where assessment_responses.is_correct)::integer,
           count(*)::integer),
         app.mastery_band_for(app.percentage_for(
           count(*) filter (where assessment_responses.is_correct)::integer,
           count(*)::integer))
  from app.assessment_responses
  where assessment_responses.attempt_id = p_attempt_id
  group by assessment_responses.delivered_competency_id
  on conflict (attempt_id, competency_id) do update set
    raw_score = excluded.raw_score,
    max_score = excluded.max_score,
    percentage = excluded.percentage,
    mastery_band = excluded.mastery_band;

  select count(*) filter (where assessment_responses.is_correct)::integer,
         count(*)::integer
  into v_raw, v_max
  from app.assessment_responses
  where assessment_responses.attempt_id = p_attempt_id;

  if v_max <> v_snapshot_count then
    raise exception 'The assessment attempt question snapshot is incomplete'
      using errcode = 'P0004';
  end if;

  insert into app.competency_progress
    (student_id, competency_id, diagnostic_score, current_score, mastery_band,
     attempt_count, last_studied_at)
  select v_student_id, competency_results.competency_id,
         case when v_assessment_type = 'diagnostic'::app.assessment_type
              then competency_results.percentage end,
         competency_results.percentage, competency_results.mastery_band, 1, now()
  from app.competency_results
  where competency_results.attempt_id = p_attempt_id
  on conflict (student_id, competency_id) do update set
    diagnostic_score = coalesce(
      competency_progress.diagnostic_score, excluded.diagnostic_score),
    current_score = excluded.current_score,
    mastery_band = excluded.mastery_band,
    attempt_count = competency_progress.attempt_count + 1,
    last_studied_at = now();

  if v_assessment_type = 'diagnostic'::app.assessment_type then
    delete from app.learning_path_items
    where learning_path_items.student_id = v_student_id;

    insert into app.learning_path_items
      (student_id, competency_id, module_id, priority, reason, status)
    select v_student_id, ranked.competency_id, ranked.module_id, ranked.priority,
           'Assessment score of ' || trim(trailing '.' from trim(trailing '0' from
             ranked.percentage::text)) || '% places this competency in the '
             || ranked.mastery_band || ' band.',
           case
             when ranked.module_is_complete then 'completed'::app.path_item_status
             when ranked.priority = 1 then 'available'::app.path_item_status
             else 'locked'::app.path_item_status
           end
    from (
      select competency_results.competency_id, competency_results.percentage,
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

  select jsonb_build_object(
    'attempt_id', attempts.attempt_id,
    'assessment_id', attempts.assessment_id,
    'status', attempts.status,
    'overall_score', attempts.overall_score,
    'started_at', attempts.started_at,
    'submitted_at', attempts.submitted_at,
    'competency_results', coalesce(results.items, '[]'::jsonb),
    'recommended_learning_path', coalesce(path.items, '[]'::jsonb),
    'next_action', case when coalesce(jsonb_array_length(path.items), 0) > 0
      then jsonb_build_object('type', 'learning_path', 'label', 'Start Your Learning Path')
      else jsonb_build_object('type', 'dashboard', 'label', 'Return to Dashboard') end
  ) into v_payload
  from app.assessment_attempts as attempts
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'competency_id', cr.competency_id, 'competency_name', c.name,
      'raw_score', cr.raw_score, 'max_score', cr.max_score,
      'percentage', cr.percentage, 'mastery_band', cr.mastery_band)
      order by cr.percentage, cr.competency_id) as items
    from app.competency_results cr
    join app.competencies c on c.competency_id = cr.competency_id
    where cr.attempt_id = attempts.attempt_id
  ) results on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', lpi.path_item_id, 'priority', lpi.priority, 'reason', lpi.reason,
      'status', lpi.status,
      'competency', jsonb_build_object('id', lpi.competency_id,
        'code', c.code, 'name', c.name),
      'module', jsonb_build_object('id', lpi.module_id,
        'title', lm.title, 'estimated_minutes', lm.estimated_minutes))
      order by lpi.priority, lpi.path_item_id) as items
    from app.learning_path_items lpi
    join app.competencies c on c.competency_id = lpi.competency_id
    join app.learning_modules lm on lm.module_id = lpi.module_id
    where v_assessment_type = 'diagnostic'::app.assessment_type
      and lpi.student_id = attempts.student_id
      and exists (
        select 1 from app.competency_results attempt_results
        where attempt_results.attempt_id = attempts.attempt_id
          and attempt_results.competency_id = lpi.competency_id
          and attempt_results.mastery_band <> 'Mastered'::app.mastery_band)
  ) path on true
  where attempts.attempt_id = p_attempt_id;

  update app.assessment_attempts
  set result_payload = v_payload
  where assessment_attempts.attempt_id = p_attempt_id
    and assessment_attempts.result_payload is null
  returning * into v_row;

  if not found then
    raise exception 'The assessment result payload could not be frozen'
      using errcode = 'P0004';
  end if;

  return v_row;
end;
$$;

-- No report writer remains callable after scoring.
drop function if exists app.store_assessment_result_payload(uuid, jsonb);

comment on function app.start_assessment_attempt(uuid) is
  'Opens or resumes a complete published assessment only when the learner grade matches, with immutable question snapshots.';
comment on function app.submit_assessment_attempt(uuid, jsonb) is
  'Atomically grades an attempt, generates its diagnostic path, and freezes the attempt-specific canonical report before returning.';

commit;
