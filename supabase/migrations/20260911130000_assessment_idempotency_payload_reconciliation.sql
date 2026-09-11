-- Reconcile assessment idempotency and delivery confidentiality on databases
-- that applied the original F2 migrations before their definitions were hardened.

begin;

create or replace function app.claim_assessment_submission_idempotency(
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

  if not found then
    raise exception 'The assessment submission idempotency claim could not be read'
      using errcode = '40001';
  end if;

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

revoke all on function app.claim_assessment_submission_idempotency(text, text)
  from public, anon;
grant execute on function app.claim_assessment_submission_idempotency(text, text)
  to authenticated, service_role;

create or replace function app.assessment_delivery_payload_is_safe(p_value jsonb)
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

revoke all on function app.assessment_delivery_payload_is_safe(jsonb)
  from public, anon, authenticated;
grant execute on function app.assessment_delivery_payload_is_safe(jsonb)
  to service_role;

alter table app.assessment_responses
  drop constraint if exists assessment_responses_delivered_payload_no_solution,
  drop constraint if exists assessment_responses_delivered_payload_safe;

alter table app.assessment_responses
  add constraint assessment_responses_delivered_payload_safe
    check (
      delivered_payload is null
      or app.assessment_delivery_payload_is_safe(delivered_payload)
    ) not valid;

-- Refuse deployment when an existing snapshot has unsafe or unknown structure.
-- Correctness metadata must be reviewed, never silently removed or rewritten.
alter table app.assessment_responses
  validate constraint assessment_responses_delivered_payload_safe;

drop function if exists app.assessment_payload_has_confidential_key(jsonb);
drop function if exists app.store_assessment_result_payload(uuid, jsonb);

commit;
