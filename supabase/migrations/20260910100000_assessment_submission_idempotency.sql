-- Transactional idempotency for final assessment submissions.
--
-- The endpoint is fixed inside these functions so callers cannot use this
-- narrow capability to inspect or mutate idempotency records belonging to
-- another operation. The actor always comes from auth.uid().

create function app.claim_assessment_submission_idempotency(
  p_idempotency_key text,
  p_request_fingerprint text
)
returns table (
  claim_status text,
  response_status integer,
  response_body jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_stored_fingerprint text;
  v_response_status integer;
  v_response_body jsonb;
begin
  if v_user_id is null
     or not app.is_active_account()
     or not app.is_student()
     or not exists (
       select 1
       from app.student_profiles
       where student_profiles.user_id = v_user_id
     ) then
    raise exception 'Only an active learner may submit an assessment'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null
     or btrim(p_idempotency_key) = ''
     or char_length(p_idempotency_key) not between 8 and 255 then
    raise exception 'Idempotency key must contain between 8 and 255 characters'
      using errcode = '22023';
  end if;

  if p_request_fingerprint is null or btrim(p_request_fingerprint) = '' then
    raise exception 'Request fingerprint must not be blank'
      using errcode = '22023';
  end if;

  -- ON CONFLICT waits for an uncommitted row with this primary key. Once the
  -- competing transaction commits, the SELECT FOR UPDATE below reads its exact
  -- completed response; if it rolls back, this transaction owns the new row.
  insert into app.idempotency_keys
    (user_id, endpoint, idempotency_key, request_fingerprint)
  values (
    v_user_id,
    'POST /assessment-attempts/{id}/submit',
    p_idempotency_key,
    p_request_fingerprint
  )
  on conflict (user_id, endpoint, idempotency_key) do nothing;

  select
    idempotency_keys.request_fingerprint,
    idempotency_keys.response_status,
    idempotency_keys.response_body
  into v_stored_fingerprint, v_response_status, v_response_body
  from app.idempotency_keys
  where idempotency_keys.user_id = v_user_id
    and idempotency_keys.endpoint = 'POST /assessment-attempts/{id}/submit'
    and idempotency_keys.idempotency_key = p_idempotency_key
  for update;

  if v_stored_fingerprint <> p_request_fingerprint then
    return query select 'conflict'::text, null::integer, null::jsonb;
  elsif v_response_status is not null then
    return query select 'replay'::text, v_response_status, v_response_body;
  else
    return query select 'claimed'::text, null::integer, null::jsonb;
  end if;
end;
$$;

comment on function app.claim_assessment_submission_idempotency(text, text) is
  'Claims the calling active learner''s final-assessment submission key, or returns its completed response after safely rendezvousing with a concurrent request.';

create function app.complete_assessment_submission_idempotency(
  p_idempotency_key text,
  p_request_fingerprint text,
  p_response_status integer,
  p_response_body jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_stored_fingerprint text;
  v_completed_at timestamptz;
begin
  if v_user_id is null
     or not app.is_active_account()
     or not app.is_student()
     or not exists (
       select 1
       from app.student_profiles
       where student_profiles.user_id = v_user_id
     ) then
    raise exception 'Only an active learner may submit an assessment'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null
     or btrim(p_idempotency_key) = ''
     or char_length(p_idempotency_key) not between 8 and 255 then
    raise exception 'Idempotency key must contain between 8 and 255 characters'
      using errcode = '22023';
  end if;

  if p_request_fingerprint is null or btrim(p_request_fingerprint) = '' then
    raise exception 'Request fingerprint must not be blank'
      using errcode = '22023';
  end if;

  if p_response_status not between 100 and 599 or p_response_body is null then
    raise exception 'A valid response status and body are required'
      using errcode = '22023';
  end if;

  select idempotency_keys.request_fingerprint, idempotency_keys.completed_at
  into v_stored_fingerprint, v_completed_at
  from app.idempotency_keys
  where idempotency_keys.user_id = v_user_id
    and idempotency_keys.endpoint = 'POST /assessment-attempts/{id}/submit'
    and idempotency_keys.idempotency_key = p_idempotency_key
  for update;

  if not found then
    raise exception 'No assessment submission idempotency claim exists'
      using errcode = 'P0002';
  end if;

  if v_stored_fingerprint <> p_request_fingerprint then
    raise exception 'Idempotency key was claimed for a different request'
      using errcode = '22023';
  end if;

  if v_completed_at is not null then
    return false;
  end if;

  update app.idempotency_keys
  set response_status = p_response_status,
      response_body = p_response_body,
      completed_at = now()
  where idempotency_keys.user_id = v_user_id
    and idempotency_keys.endpoint = 'POST /assessment-attempts/{id}/submit'
    and idempotency_keys.idempotency_key = p_idempotency_key;

  return true;
end;
$$;

comment on function app.complete_assessment_submission_idempotency(text, text, integer, jsonb) is
  'Completes the calling active learner''s claimed final-assessment submission key with the exact HTTP response envelope.';

revoke all on function app.claim_assessment_submission_idempotency(text, text)
  from public, anon;

revoke all on function app.complete_assessment_submission_idempotency(text, text, integer, jsonb)
  from public, anon;

grant execute on function app.claim_assessment_submission_idempotency(text, text)
  to authenticated, service_role;

grant execute on function app.complete_assessment_submission_idempotency(text, text, integer, jsonb)
  to authenticated, service_role;
