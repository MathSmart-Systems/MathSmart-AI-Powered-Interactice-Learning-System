-- MathSmart Phase 5 — user administration and the diagnostic reset.
--
-- `authenticated` may update its own display fields on app.user_profiles and
-- nothing else: the column grant carries full_name, avatar_url and preferences,
-- and deliberately not role or account_status. That is what stops an account
-- from promoting itself, so the administration endpoints that do change those
-- go through functions instead of a wider grant.
--
-- The diagnostic reset is the same story from the other side: an attempt is
-- SELECT-only for the caller, so voiding one and authorising a fresh sitting is
-- a single audited function rather than three separate writes the API would
-- have to keep consistent by itself.

-- ---------------------------------------------------------------------------
-- app.set_account_status
-- ---------------------------------------------------------------------------
-- Suspension and archiving. Note what this cannot do: it will not change the
-- caller's own status, because an administrator who suspends themselves has no
-- way back in, and it never touches the Auth account — a suspended profile is
-- refused on every request by app.is_active_account, which is what makes
-- suspension take effect immediately even though the access token stays valid.
create function app.set_account_status(
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
  if not app.is_teacher_admin() then
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

comment on function app.set_account_status(uuid, app.account_status, text) is
  'Suspends, archives or restores an account. Refuses to change the caller''s own status, and audits every change. Does not touch the Auth account.';

revoke all on function app.set_account_status(uuid, app.account_status, text) from public;
grant execute on function app.set_account_status(uuid, app.account_status, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.reset_diagnostic
-- ---------------------------------------------------------------------------
-- Voids the learner's most recent diagnostic attempt with the required reason,
-- returns them to "not started", and records the authorization that lets them
-- sit it again. One transaction, because a reset that half happened would leave
-- a learner unable to proceed.
create function app.reset_diagnostic(
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
  where teacher_admin_profiles.user_id = v_actor;

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
      voided_by = v_actor,
      voided_at = now()
  where assessment_attempts.attempt_id = v_attempt.attempt_id
  returning * into v_attempt;

  update app.student_profiles
  set diagnostic_status = 'not_started'::app.diagnostic_status
  where student_profiles.student_id = p_student_id;

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
  'Voids a learner''s latest diagnostic attempt with a required reason, returns them to not_started, records the reassessment authorization, and audits the whole thing in one transaction.';

revoke all on function app.reset_diagnostic(uuid, text, text) from public;
grant execute on function app.reset_diagnostic(uuid, text, text) to authenticated, service_role;
