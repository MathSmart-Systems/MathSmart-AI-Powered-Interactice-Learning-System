-- Keep every assessment question in the assessment's grade at authoring time,
-- and recheck the invariant at the authoritative attempt-insert boundary.

begin;

-- Serialize migration validation against all grade-sensitive authoring writes.
lock table app.assessments, app.assessment_questions, app.questions, app.competencies
  in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from app.assessment_questions as membership
    join app.assessments
      on assessments.assessment_id = membership.assessment_id
    join app.questions
      on questions.question_id = membership.question_id
    join app.competencies
      on competencies.competency_id = questions.competency_id
    where competencies.grade_id is distinct from assessments.grade_id
  ) then
    raise exception 'Existing assessment questions do not match their assessment grade'
      using errcode = 'P0004';
  end if;
end;
$$;

create function app.assessment_question_grades_match(p_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from app.assessment_questions as membership
    join app.questions
      on questions.question_id = membership.question_id
    join app.competencies
      on competencies.competency_id = questions.competency_id
    join app.assessments
      on assessments.assessment_id = membership.assessment_id
    where membership.assessment_id = p_assessment_id
      and competencies.grade_id is distinct from assessments.grade_id
  );
$$;

create function app.enforce_assessment_question_grade_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- One transaction-wide lock closes phantom-insert races between membership
  -- authoring and attempt insertion. It is intentionally shared by every
  -- grade-sensitive trigger below.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('app.assessment_question_grade_consistency', 0)
  );

  if exists (
    select 1
    from app.assessment_questions as membership
    join app.assessments
      on assessments.assessment_id = membership.assessment_id
    join app.questions
      on questions.question_id = membership.question_id
    join app.competencies
      on competencies.competency_id = questions.competency_id
    where competencies.grade_id is distinct from assessments.grade_id
  ) then
    raise exception 'Assessment questions must match the assessment grade'
      using errcode = 'P0004';
  end if;

  return null;
end;
$$;

create constraint trigger assessment_questions_grade_consistency
  after insert or update of assessment_id, question_id
  on app.assessment_questions
  deferrable initially immediate
  for each row
  execute function app.enforce_assessment_question_grade_consistency();

create constraint trigger assessments_question_grade_consistency
  after update of grade_id
  on app.assessments
  deferrable initially immediate
  for each row
  execute function app.enforce_assessment_question_grade_consistency();

create constraint trigger questions_assessment_grade_consistency
  after update of competency_id
  on app.questions
  deferrable initially immediate
  for each row
  execute function app.enforce_assessment_question_grade_consistency();

create constraint trigger competencies_assessment_grade_consistency
  after update of grade_id
  on app.competencies
  deferrable initially immediate
  for each row
  execute function app.enforce_assessment_question_grade_consistency();

create function app.enforce_assessment_attempt_question_grade_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('app.assessment_question_grade_consistency', 0)
  );

  if not app.assessment_question_grades_match(new.assessment_id) then
    raise exception 'The assessment has no complete published question set'
      using errcode = 'P0004';
  end if;

  return new;
end;
$$;

create trigger assessment_attempts_question_grade_consistency
  before insert on app.assessment_attempts
  for each row
  execute function app.enforce_assessment_attempt_question_grade_consistency();

comment on function app.assessment_question_grades_match(uuid) is
  'Internal fail-closed check that every question competency matches one assessment grade.';
comment on function app.enforce_assessment_question_grade_consistency() is
  'Constraint trigger enforcing same-grade assessment membership across membership and grade-link authoring changes.';
comment on function app.enforce_assessment_attempt_question_grade_consistency() is
  'Attempt-insert gate that serializes with authoring and refuses cross-grade assessment questions.';

revoke all on function app.assessment_question_grades_match(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app.enforce_assessment_question_grade_consistency()
  from public, anon, authenticated, service_role;
revoke all on function app.enforce_assessment_attempt_question_grade_consistency()
  from public, anon, authenticated, service_role;

commit;
