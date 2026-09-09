-- MathSmart Phase 6 — a reassessment needs the educator's authorization.
--
-- app.authorize_reassessment writes app.reassessment_authorizations, and until
-- now nothing read them: app.start_assessment_attempt checked the learner, the
-- account status and the published assessment, and then opened a new attempt
-- however many the learner had already finished. The educator's decision was
-- recorded and not enforced, so a learner could retake a scored assessment
-- freely and the grant meant nothing.
--
-- The table already models a one-shot grant: consumed_at and consumed_attempt_id
-- are written together, under a CHECK that keeps them consistent. This function
-- is what spends one.
--
-- Consumption is a compare-and-set — `update ... where consumed_at is null`,
-- with the row count deciding the outcome — rather than a read followed by a
-- write. That is what makes it safe when two attempts race: under READ
-- COMMITTED the second writer blocks on the first writer's row lock, re-checks
-- the predicate once it commits, matches nothing and refuses. Nothing here
-- depends on the two transactions being serialized by the caller, and no grant
-- can be spent twice.
--
-- The insert of the attempt comes before the consumption so that
-- consumed_attempt_id can name it. Both are in one transaction: if the
-- consumption refuses, the attempt it would have opened is rolled back with it.
--
-- Only a finished attempt requires a grant. A voided one does not, which is what
-- makes app.reset_diagnostic work: it voids the sitting and writes an
-- authorization of its own, so the learner may sit the diagnostic again exactly
-- once.

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
  v_authorization_id uuid;
  v_consumed uuid;
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
    -- Resuming the open attempt. This is not a second sitting, so it spends no
    -- authorization.
    return v_row;
  end if;

  -- A finished sitting of this assessment means any further one is a
  -- reassessment, and a reassessment is the educator's decision to make.
  if exists (
    select 1
    from app.assessment_attempts
    where assessment_attempts.student_id = v_student_id
      and assessment_attempts.assessment_id = p_assessment_id
      and assessment_attempts.status in (
        'submitted'::app.attempt_status, 'scored'::app.attempt_status)
  ) then
    select reassessment_authorizations.authorization_id into v_authorization_id
    from app.reassessment_authorizations
    where reassessment_authorizations.student_id = v_student_id
      and reassessment_authorizations.assessment_id = p_assessment_id
      and reassessment_authorizations.consumed_at is null
      and (reassessment_authorizations.expires_at is null
           or reassessment_authorizations.expires_at > now())
    order by reassessment_authorizations.granted_at
    limit 1;

    if v_authorization_id is null then
      raise exception 'A reassessment needs an authorization' using errcode = '42501';
    end if;
  end if;

  insert into app.assessment_attempts (assessment_id, student_id, assessment_version)
  values (p_assessment_id, v_student_id, v_version)
  returning * into v_row;

  if v_authorization_id is not null then
    update app.reassessment_authorizations
    set consumed_at = now(),
        consumed_attempt_id = v_row.attempt_id
    where reassessment_authorizations.authorization_id = v_authorization_id
      and reassessment_authorizations.consumed_at is null
    returning reassessment_authorizations.authorization_id into v_consumed;

    if v_consumed is null then
      -- Another attempt spent this grant while this one was being opened. The
      -- refusal rolls back the attempt inserted just above.
      raise exception 'A reassessment needs an authorization' using errcode = '42501';
    end if;
  end if;

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
  'Opens or resumes the calling learner''s attempt at a published assessment. A sitting after a finished one requires an unexpired, unconsumed reassessment authorization, which it spends atomically in the same transaction.';
