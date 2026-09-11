-- Freeze the exact question set delivered to each assessment attempt.
--
-- assessment_responses already has the correct attempt/question identity. It is
-- extended here with an immutable learner-safe delivery payload and a separate
-- confidential grading key. Delivery, autosave and grading then use this
-- snapshot rather than mutable authoring tables.

begin;

alter table app.assessment_attempts
  add column assessment_type_snapshot app.assessment_type,
  add column assessment_grade_id_snapshot uuid,
  add column assessment_payload jsonb,
  add column result_payload jsonb,
  add column resumed boolean not null default false,
  add column question_snapshot_created_at timestamptz,
  add column question_snapshot_count integer;

alter table app.assessment_attempts
  add constraint assessment_attempts_snapshot_count_positive
    check (question_snapshot_count is null or question_snapshot_count >= 1),
  add constraint assessment_attempts_snapshot_is_consistent
    check (
      (question_snapshot_created_at is null and question_snapshot_count is null)
      or
      (question_snapshot_created_at is not null and question_snapshot_count is not null)
    );

create function app.assessment_delivery_payload_is_safe(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'object'
    and p_value ?& array[
      'id', 'competency_id', 'competency_name', 'text', 'type', 'choices',
      'difficulty', 'visual_aid_description'
    ]
    and not exists (
      select 1
      from jsonb_object_keys(p_value) as item(key)
      where item.key <> all (array[
        'id', 'competency_id', 'competency_name', 'text', 'type', 'choices',
        'difficulty', 'visual_aid_description'
      ])
    )
    and jsonb_typeof(p_value -> 'id') = 'string'
    and jsonb_typeof(p_value -> 'competency_id') = 'string'
    and jsonb_typeof(p_value -> 'competency_name') = 'string'
    and jsonb_typeof(p_value -> 'text') = 'string'
    and jsonb_typeof(p_value -> 'type') = 'string'
    and p_value ->> 'type' in ('multiple_choice', 'number_input', 'fill_blank')
    and jsonb_typeof(p_value -> 'choices') = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(p_value -> 'choices') as choice(value)
      where jsonb_typeof(choice.value) not in ('string', 'number', 'boolean')
    )
    and jsonb_typeof(p_value -> 'difficulty') = 'string'
    and p_value ->> 'difficulty' in ('easy', 'medium', 'hard')
    and (
      jsonb_typeof(p_value -> 'visual_aid_description') = 'null'
      or jsonb_typeof(p_value -> 'visual_aid_description') = 'string'
    ),
    false
  );
$$;

-- Remove the table-wide read before adding a confidential column. The safe
-- columns are granted back explicitly at the end of this migration.
revoke select on app.assessment_responses from authenticated;

alter table app.assessment_responses
  add column delivered_position integer,
  add column delivered_competency_id uuid
    references app.competencies (competency_id)
    on update restrict
    on delete restrict,
  add column delivered_payload jsonb,
  add column grading_answer_key jsonb;

alter table app.assessment_responses
  add constraint assessment_responses_delivered_position_positive
    check (delivered_position is null or delivered_position >= 1),
  add constraint assessment_responses_delivered_payload_object
    check (delivered_payload is null or jsonb_typeof(delivered_payload) = 'object'),
  add constraint assessment_responses_delivered_payload_safe
    check (
      delivered_payload is null
      or app.assessment_delivery_payload_is_safe(delivered_payload)
    ),
  add constraint assessment_responses_grading_key_present
    check (grading_answer_key is null or grading_answer_key <> 'null'::jsonb);

create unique index assessment_responses_attempt_position_key
  on app.assessment_responses (attempt_id, delivered_position)
  where delivered_position is not null;

-- Keep validation and backfill isolated from concurrent authoring writes.
lock table app.assessment_questions, app.questions, app.competencies in share mode;

-- Historical classification is immutable too, including finished attempts.
update app.assessment_attempts as attempts
set assessment_type_snapshot = assessments.assessment_type,
    assessment_grade_id_snapshot = assessments.grade_id,
    assessment_payload = jsonb_build_object(
      'id', assessments.assessment_id,
      'title', assessments.title,
      'type', assessments.assessment_type,
      'duration_minutes', assessments.duration_minutes
    )
from app.assessments
where assessments.assessment_id = attempts.assessment_id;

alter table app.assessment_attempts
  alter column assessment_grade_id_snapshot set not null;

-- Existing open attempts cross the compatibility boundary at migration time.
-- Refuse the deployment rather than silently snapshotting only the published
-- subset of an assessment or retaining a response outside current membership.
do $$
begin
  if exists (
    select 1
    from app.assessment_attempts as attempts
    left join app.assessment_questions as membership
      on membership.assessment_id = attempts.assessment_id
    left join app.questions
      on questions.question_id = membership.question_id
    left join app.competencies
      on competencies.competency_id = questions.competency_id
    where attempts.status = 'in_progress'::app.attempt_status
    group by attempts.attempt_id
    having count(membership.question_id) = 0
       or count(membership.question_id) filter (
            where questions.status = 'published'::app.publication_status
              and competencies.status = 'published'::app.publication_status
          ) <> count(membership.question_id)
  ) or exists (
    select 1
    from app.assessment_attempts as attempts
    join app.assessment_responses as responses
      on responses.attempt_id = attempts.attempt_id
    left join app.assessment_questions as membership
      on membership.assessment_id = attempts.assessment_id
     and membership.question_id = responses.question_id
    where attempts.status = 'in_progress'::app.attempt_status
      and membership.question_id is null
  ) then
    raise exception 'An open assessment attempt has no complete published question set';
  end if;
end;
$$;

insert into app.assessment_responses (
  attempt_id,
  question_id,
  question_version,
  delivered_position,
  delivered_competency_id,
  delivered_payload,
  grading_answer_key
)
select
  attempts.attempt_id,
  questions.question_id,
  questions.version,
  membership.position,
  questions.competency_id,
  jsonb_build_object(
    'id', questions.question_id,
    'competency_id', questions.competency_id,
    'competency_name', competencies.name,
    'text', questions.prompt,
    'type', questions.question_type,
    'choices', questions.choices,
    'difficulty', questions.difficulty,
    'visual_aid_description', questions.visual_aid_description
  ),
  questions.answer_key
from app.assessment_attempts as attempts
join app.assessment_questions as membership
  on membership.assessment_id = attempts.assessment_id
join app.questions
  on questions.question_id = membership.question_id
join app.competencies
  on competencies.competency_id = questions.competency_id
where attempts.status = 'in_progress'::app.attempt_status
on conflict (attempt_id, question_id) do update set
  question_version = excluded.question_version,
  delivered_position = excluded.delivered_position,
  delivered_competency_id = excluded.delivered_competency_id,
  delivered_payload = excluded.delivered_payload,
  grading_answer_key = excluded.grading_answer_key;

update app.assessment_attempts as attempts
set question_snapshot_created_at = now(),
    question_snapshot_count = (
      select count(*)::integer
      from app.assessment_responses
      where assessment_responses.attempt_id = attempts.attempt_id
        and assessment_responses.delivered_position is not null
    )
where attempts.status = 'in_progress'::app.attempt_status;

create function app.may_start_reassessment(
  p_student_id uuid,
  p_assessment_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not app.is_active_account() then
    return false;
  end if;

  if not app.is_teacher_admin() and not exists (
    select 1
    from app.student_profiles
    where student_profiles.student_id = p_student_id
      and student_profiles.user_id = v_actor
  ) then
    return false;
  end if;

  return p_assessment_id is not null
    and exists (
      select 1
      from app.assessments
      where assessments.assessment_id = p_assessment_id
        and assessments.status = 'published'::app.publication_status
    )
    and exists (
      select 1
      from app.assessment_attempts
      where assessment_attempts.student_id = p_student_id
        and assessment_attempts.assessment_id = p_assessment_id
        and assessment_attempts.status <> 'in_progress'::app.attempt_status
    )
    and not exists (
      select 1
      from app.assessment_attempts
      where assessment_attempts.student_id = p_student_id
        and assessment_attempts.assessment_id = p_assessment_id
        and assessment_attempts.status = 'in_progress'::app.attempt_status
    )
    and exists (
      select 1
      from app.reassessment_authorizations
      where reassessment_authorizations.student_id = p_student_id
        and reassessment_authorizations.assessment_id = p_assessment_id
        and reassessment_authorizations.consumed_at is null
        and reassessment_authorizations.superseded_at is null
        and (
          reassessment_authorizations.expires_at is null
          or reassessment_authorizations.expires_at > now()
        )
    );
end;
$$;

comment on function app.may_start_reassessment(uuid, uuid) is
  'Returns only whether the named assessment has a usable retake grant. A learner may ask only about their own record; authorization details remain private.';

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

  select assessments.grade_id, assessments.version, assessments.assessment_type
  into v_assessment_grade_id, v_version, v_assessment_type
  from app.assessments
  where assessments.assessment_id = p_assessment_id
    and assessments.status = 'published'::app.publication_status
  for share;

  if v_version is null then
    raise exception 'No such published assessment' using errcode = 'P0002';
  end if;

  if v_student_grade_id is distinct from v_assessment_grade_id then
    raise exception 'This assessment is not available for your grade'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from app.assessment_attempts
    where assessment_attempts.student_id = v_student_id
      and assessment_attempts.assessment_id = p_assessment_id
  ) then
    select reassessment_authorizations.authorization_id into v_authorization_id
    from app.reassessment_authorizations
    where reassessment_authorizations.student_id = v_student_id
      and reassessment_authorizations.assessment_id = p_assessment_id
      and reassessment_authorizations.consumed_at is null
      and reassessment_authorizations.superseded_at is null
      and (
        reassessment_authorizations.expires_at is null
        or reassessment_authorizations.expires_at > now()
      )
    order by reassessment_authorizations.granted_at
    limit 1
    for update;

    if v_authorization_id is null then
      raise exception 'A reassessment needs an authorization' using errcode = '42501';
    end if;
  end if;

  -- Lock the current membership and source rows until this transaction has
  -- copied them. Concurrent authoring may proceed afterwards, but cannot change
  -- the snapshot selected for this attempt.
  perform 1
  from app.assessment_questions as membership
  join app.questions on questions.question_id = membership.question_id
  join app.competencies on competencies.competency_id = questions.competency_id
  where membership.assessment_id = p_assessment_id
  for share of membership, questions, competencies;

  select
    count(*)::integer,
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

  insert into app.assessment_attempts (
    assessment_id,
    student_id,
    assessment_version,
    assessment_type_snapshot,
    assessment_grade_id_snapshot,
    assessment_payload
  )
  select
    assessments.assessment_id,
    v_student_id,
    assessments.version,
    assessments.assessment_type,
    assessments.grade_id,
    jsonb_build_object(
      'id', assessments.assessment_id,
      'title', assessments.title,
      'type', assessments.assessment_type,
      'duration_minutes', assessments.duration_minutes
    )
  from app.assessments
  where assessments.assessment_id = p_assessment_id
  returning * into v_row;

  insert into app.assessment_responses (
    attempt_id,
    question_id,
    question_version,
    delivered_position,
    delivered_competency_id,
    delivered_payload,
    grading_answer_key
  )
  select
    v_row.attempt_id,
    questions.question_id,
    questions.version,
    membership.position,
    questions.competency_id,
    jsonb_build_object(
      'id', questions.question_id,
      'competency_id', questions.competency_id,
      'competency_name', competencies.name,
      'text', questions.prompt,
      'type', questions.question_type,
      'choices', questions.choices,
      'difficulty', questions.difficulty,
      'visual_aid_description', questions.visual_aid_description
    ),
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
  set question_snapshot_created_at = now(),
      question_snapshot_count = v_snapshot_count
  where assessment_attempts.attempt_id = v_row.attempt_id
  returning * into v_row;

  if v_authorization_id is not null then
    update app.reassessment_authorizations
    set consumed_at = now(),
        consumed_attempt_id = v_row.attempt_id
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

create or replace function app.save_assessment_answers(p_attempt_id uuid, p_answers jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_student_grade_id uuid;
  v_assessment_grade_id uuid;
  v_snapshot_count integer;
  v_saved integer;
begin
  select student_profiles.student_id, student_profiles.grade_id
  into v_student_id, v_student_grade_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account())
  for update;

  if v_student_id is null then
    raise exception 'Only a learner may answer an assessment' using errcode = '42501';
  end if;

  select assessment_attempts.question_snapshot_count,
         assessment_attempts.assessment_grade_id_snapshot
  into v_snapshot_count, v_assessment_grade_id
  from app.assessment_attempts
  where assessment_attempts.attempt_id = p_attempt_id
    and assessment_attempts.student_id = v_student_id
    and assessment_attempts.status = 'in_progress'::app.attempt_status
  for update;

  if v_snapshot_count is null then
    raise exception 'No attempt of yours is in progress' using errcode = 'P0002';
  end if;

  if v_student_grade_id is distinct from v_assessment_grade_id then
    raise exception 'This assessment is not available for your grade'
      using errcode = 'P0001';
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
    select distinct on (submitted.question_id)
      submitted.question_id,
      submitted.answer,
      submitted.answer_position
    from submitted
    join app.assessment_responses as snapshot
      on snapshot.attempt_id = p_attempt_id
     and snapshot.question_id = submitted.question_id
     and snapshot.delivered_position is not null
     and snapshot.grading_answer_key is not null
    order by submitted.question_id, submitted.answer_position desc
  ),
  saved as (
    update app.assessment_responses
    set answer = belonging.answer,
        is_correct = null
    from belonging
    where assessment_responses.attempt_id = p_attempt_id
      and assessment_responses.question_id = belonging.question_id
    returning 1
  )
  select count(*) into v_saved from saved;

  return v_saved;
end;
$$;

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

  select
    assessment_attempts.assessment_type_snapshot,
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
  select
    p_attempt_id,
    assessment_responses.delivered_competency_id,
    count(*) filter (where assessment_responses.is_correct)::integer,
    count(*)::integer,
    app.percentage_for(
      count(*) filter (where assessment_responses.is_correct)::integer,
      count(*)::integer
    ),
    app.mastery_band_for(
      app.percentage_for(
        count(*) filter (where assessment_responses.is_correct)::integer,
        count(*)::integer
      )
    )
  from app.assessment_responses
  where assessment_responses.attempt_id = p_attempt_id
  group by assessment_responses.delivered_competency_id
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

  if v_max <> v_snapshot_count then
    raise exception 'The assessment attempt question snapshot is incomplete'
      using errcode = 'P0004';
  end if;

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

  -- The API stores the complete report payload immediately afterwards in the
  -- same request transaction. No later attempt may reuse live path state.
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

create function app.store_assessment_result_payload(
  p_attempt_id uuid,
  p_result_payload jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.is_active_account() or not app.is_student() then
    raise exception 'Only an active learner may store an assessment result'
      using errcode = '42501';
  end if;

  if p_result_payload is null or jsonb_typeof(p_result_payload) <> 'object' then
    raise exception 'A complete assessment result payload is required'
      using errcode = '22023';
  end if;

  update app.assessment_attempts
  set result_payload = p_result_payload
  where assessment_attempts.attempt_id = p_attempt_id
    and assessment_attempts.student_id = app.current_student_id()
    and assessment_attempts.status = 'scored'::app.attempt_status
    and assessment_attempts.result_payload is null;

  return found;
end;
$$;

create function app.prevent_assessment_snapshot_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.question_id is distinct from new.question_id
     or old.question_version is distinct from new.question_version
     or old.delivered_position is distinct from new.delivered_position
     or old.delivered_competency_id is distinct from new.delivered_competency_id
     or old.delivered_payload is distinct from new.delivered_payload
     or old.grading_answer_key is distinct from new.grading_answer_key then
    raise exception 'Delivered assessment question snapshots are immutable'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger assessment_responses_snapshot_immutable
  before update of question_id, question_version, delivered_position,
    delivered_competency_id, delivered_payload, grading_answer_key
  on app.assessment_responses
  for each row
  when (old.delivered_position is not null)
  execute function app.prevent_assessment_snapshot_changes();

comment on function app.start_assessment_attempt(uuid) is
  'Opens or resumes a learner attempt and atomically freezes its complete published question set, learner-safe payload, competency attribution and grading keys.';
comment on function app.save_assessment_answers(uuid, jsonb) is
  'Saves answers only for questions frozen into the calling learner''s open attempt.';
comment on function app.submit_assessment_attempt(uuid, jsonb) is
  'Grades an open learner attempt only against its immutable start-time question snapshot and writes deterministic results and progression.';
comment on function app.store_assessment_result_payload(uuid, jsonb) is
  'Stores the exact deterministic scored report once so later attempts cannot change its restored recommendations.';
comment on table app.assessment_responses is
  'One immutable delivered question snapshot and mutable learner answer per assessment attempt. grading_answer_key is never selectable by authenticated actors.';
comment on column app.assessment_responses.grading_answer_key is
  'Confidential start-time answer key used only by SECURITY DEFINER grading.';

revoke all on function app.may_start_reassessment(uuid, uuid)
  from public, anon;
revoke all on function app.assessment_delivery_payload_is_safe(jsonb)
  from public, anon, authenticated;
revoke all on function app.store_assessment_result_payload(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function app.prevent_assessment_snapshot_changes()
  from public, anon, authenticated;
revoke all on function app.start_assessment_attempt(uuid)
  from public, anon;
revoke all on function app.save_assessment_answers(uuid, jsonb)
  from public, anon;
revoke all on function app.submit_assessment_attempt(uuid, jsonb)
  from public, anon;

grant execute on function app.may_start_reassessment(uuid, uuid)
  to authenticated, service_role;
grant execute on function app.assessment_delivery_payload_is_safe(jsonb)
  to service_role;
grant execute on function app.store_assessment_result_payload(uuid, jsonb)
  to service_role;
grant execute on function app.start_assessment_attempt(uuid)
  to authenticated, service_role;
grant execute on function app.save_assessment_answers(uuid, jsonb)
  to authenticated, service_role;
grant execute on function app.submit_assessment_attempt(uuid, jsonb)
  to authenticated, service_role;

grant select (
  response_id,
  attempt_id,
  question_id,
  answer,
  is_correct,
  question_version,
  delivered_position,
  delivered_competency_id,
  delivered_payload,
  created_at,
  updated_at
) on app.assessment_responses to authenticated;

revoke all on app.assessment_responses from public, anon;

-- Keep diagnostic reset aligned with immutable attempt classification and lock
-- student then attempt, the same order used by start_assessment_attempt.
-- Adding `resumed` to the composite return type created a same-named column on
-- the table. It is transport metadata only and must never persist as true.
create function app.clear_assessment_attempt_resumed_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.resumed := false;
  return new;
end;
$$;

create trigger assessment_attempts_clear_resumed_flag
  before insert or update of resumed on app.assessment_attempts
  for each row
  execute function app.clear_assessment_attempt_resumed_flag();

revoke all on function app.clear_assessment_attempt_resumed_flag()
  from public, anon, authenticated;

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
  v_authorization app.reassessment_authorizations;
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

  perform 1
  from app.student_profiles
  where student_profiles.student_id = p_student_id
  for update;

  if not found then
    raise exception 'No such learner' using errcode = 'P0002';
  end if;

  select assessment_attempts.* into v_attempt
  from app.assessment_attempts
  where assessment_attempts.student_id = p_student_id
    and assessment_attempts.assessment_type_snapshot = 'diagnostic'::app.assessment_type
    and assessment_attempts.status <> 'voided'::app.attempt_status
  order by assessment_attempts.started_at desc
  limit 1
  for update;

  if v_attempt.attempt_id is null then
    raise exception 'No diagnostic attempt was found' using errcode = 'P0002';
  end if;

  update app.assessment_attempts
  set status = 'voided'::app.attempt_status,
      voided_reason = btrim(p_reason),
      voided_by = v_teacher_admin_id,
      voided_at = now()
  where assessment_attempts.attempt_id = v_attempt.attempt_id
  returning * into v_attempt;

  update app.student_profiles
  set diagnostic_status = 'not_started'::app.diagnostic_status
  where student_profiles.student_id = p_student_id;

  update app.competency_progress
  set diagnostic_score = null
  where competency_progress.student_id = p_student_id;

  insert into app.reassessment_authorizations
    (student_id, assessment_id, authorized_by, reason)
  values (p_student_id, v_attempt.assessment_id, v_teacher_admin_id, btrim(p_reason))
  returning * into v_authorization;

  perform app.record_audit_event(
    'assessment.diagnostic_reset',
    'assessment_attempt',
    v_attempt.attempt_id,
    p_request_id,
    jsonb_build_object(
      'student_id', p_student_id,
      'assessment_id', v_attempt.assessment_id,
      'reason', btrim(p_reason),
      'authorization_id', v_authorization.authorization_id
    )
  );

  return v_attempt;
end;
$$;

revoke all on function app.reset_diagnostic(uuid, text, text)
  from public, anon;
grant execute on function app.reset_diagnostic(uuid, text, text)
  to authenticated, service_role;

commit;
