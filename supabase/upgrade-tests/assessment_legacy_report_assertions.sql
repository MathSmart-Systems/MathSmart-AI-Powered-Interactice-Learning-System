-- Assertions run after 20260911160000 applies to legacy fixture.

begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select is(
  (select result_payload ->> 'overall_score'
   from app.assessment_attempts
   where attempt_id = '77000000-0000-4000-8000-000000000001'),
  '50.00',
  'Legacy report preserves stored overall score'
);

select is(
  (select result_payload #>> '{competency_results,0,competency_name}'
   from app.assessment_attempts
   where attempt_id = '77000000-0000-4000-8000-000000000001'),
  'Second migration-time label',
  'Legacy report freezes current competency display label during backfill'
);

select is(
  (select jsonb_array_length(result_payload -> 'competency_results')
   from app.assessment_attempts
   where attempt_id = '77000000-0000-4000-8000-000000000001'),
  2,
  'Legacy report preserves all stored competency results'
);

select is(
  (select jsonb_array_length(result_payload -> 'recommended_learning_path')
   from app.assessment_attempts
   where attempt_id = '77000000-0000-4000-8000-000000000001'),
  0,
  'Legacy report does not invent historical learning path'
);

select is(
  (select result_payload #>> '{next_action,type}'
   from app.assessment_attempts
   where attempt_id = '77000000-0000-4000-8000-000000000001'),
  'dashboard',
  'Legacy report falls back to dashboard action'
);

select is(
  (select count(*)
   from app.assessment_responses
   where attempt_id = '77000000-0000-4000-8000-000000000001'
     and delivered_payload is not null),
  0::bigint,
  'Backfill does not reconstruct question snapshots'
);

select is(
  (select count(*)
   from app.assessment_responses
   where attempt_id = '77000000-0000-4000-8000-000000000001'
     and grading_answer_key is not null),
  0::bigint,
  'Backfill does not copy answer keys'
);

select throws_ok(
  $$ update app.assessment_attempts
     set result_payload = '{"overall_score":99}'::jsonb
     where attempt_id = '77000000-0000-4000-8000-000000000001' $$,
  '55000',
  'Assessment result payloads are immutable',
  'Backfilled report cannot be replaced'
);

select throws_ok(
  $$ update app.assessment_attempts
     set result_payload = null
     where attempt_id = '77000000-0000-4000-8000-000000000001' $$,
  '55000',
  'Assessment result payloads are immutable',
  'Backfilled report cannot be removed'
);

select is(
  (select result_payload ->> 'overall_score'
   from app.assessment_attempts
   where attempt_id = '77000000-0000-4000-8000-000000000001'),
  '50.00',
  'Immutable report remains unchanged after rejected writes'
);

select * from finish();
rollback;
