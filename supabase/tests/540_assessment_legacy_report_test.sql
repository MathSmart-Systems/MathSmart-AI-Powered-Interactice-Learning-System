-- Legacy assessment reports stay readable without mutable reconstruction.

begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select ok(
  not has_function_privilege(
    'public', 'app.backfill_legacy_assessment_reports()', 'execute')
  and not has_function_privilege(
    'anon', 'app.backfill_legacy_assessment_reports()', 'execute')
  and not has_function_privilege(
    'authenticated', 'app.backfill_legacy_assessment_reports()', 'execute')
  and not has_function_privilege(
    'service_role', 'app.backfill_legacy_assessment_reports()', 'execute'),
  'No application role can invoke legacy report backfill'
);

select ok(
  not (select pg_proc.prosecdef
       from pg_proc
       join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
       where pg_namespace.nspname = 'app'
         and pg_proc.proname = 'backfill_legacy_assessment_reports'),
  'Legacy report backfill uses migration-owner rights without runtime elevation'
);

select ok(
  (select pg_proc.proconfig @> array['search_path=""']
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.proname = 'backfill_legacy_assessment_reports'),
  'Legacy report backfill pins an empty search_path'
);

insert into auth.users (id, email)
values ('81000000-0000-4000-8000-000000000001', 'legacy.invalid@mathsmart.test');
insert into app.user_profiles (user_id, full_name, email, role)
values ('81000000-0000-4000-8000-000000000001', 'Invalid Legacy Learner',
        'legacy.invalid@mathsmart.test', 'student');
insert into app.student_profiles (student_id, user_id, learner_id, grade_id)
values ('82000000-0000-4000-8000-000000000001',
        '81000000-0000-4000-8000-000000000001', 'LRN-INVALID',
        (select grade_id from app.grade_levels where level = 6));
insert into app.competencies
  (competency_id, code, grade_id, domain, name, status)
values ('83000000-0000-4000-8000-000000000001', 'LEGACY-INVALID',
        (select grade_id from app.grade_levels where level = 6),
        'Numbers', 'Invalid legacy evidence', 'published');
insert into app.questions
  (question_id, competency_id, question_type, prompt, answer_key, status)
values ('84000000-0000-4000-8000-000000000001',
        '83000000-0000-4000-8000-000000000001', 'number_input',
        'Invalid legacy fixture?', '1'::jsonb, 'published');
insert into app.assessments
  (assessment_id, grade_id, title, assessment_type, status, duration_minutes)
values ('85000000-0000-4000-8000-000000000001',
        (select grade_id from app.grade_levels where level = 6),
        'Invalid legacy report', 'diagnostic', 'published', 20);
insert into app.assessment_attempts
  (attempt_id, assessment_id, student_id, status, overall_score, submitted_at,
   assessment_grade_id_snapshot, result_payload)
values ('86000000-0000-4000-8000-000000000001',
        '85000000-0000-4000-8000-000000000001',
        '82000000-0000-4000-8000-000000000001', 'scored', 100.00, now(),
        (select grade_id from app.grade_levels where level = 6), null);
insert into app.assessment_responses (attempt_id, question_id, answer, is_correct)
values ('86000000-0000-4000-8000-000000000001',
        '84000000-0000-4000-8000-000000000001', '"1"'::jsonb, true);

select is(
  app.backfill_legacy_assessment_reports(),
  0,
  'Backfill skips a scored attempt without competency results'
);

select ok(
  (select result_payload is null
   from app.assessment_attempts
   where attempt_id = '86000000-0000-4000-8000-000000000001'),
  'Skipped unbackfillable report remains a residual null'
);

select throws_ok(
  $$ update app.assessment_attempts
     set result_payload = '[]'::jsonb
     where attempt_id = '86000000-0000-4000-8000-000000000001' $$,
  '22023',
  'Assessment result payload must be an object',
  'Null-to-non-object transition is rejected'
);

select lives_ok(
  $$ update app.assessment_attempts
     set result_payload = jsonb_build_object(
       'attempt_id', attempt_id,
       'assessment_id', assessment_id,
       'status', status,
       'overall_score', overall_score,
       'started_at', started_at,
       'submitted_at', submitted_at,
       'competency_results', '[]'::jsonb,
       'recommended_learning_path', '[]'::jsonb,
       'next_action', jsonb_build_object('type', 'dashboard', 'label', 'Return to Dashboard')
     )
     where attempt_id = '86000000-0000-4000-8000-000000000001' $$,
  'Authoritative null-to-object transition remains possible'
);

select is(
  app.backfill_legacy_assessment_reports(),
  0,
  'Backfill never overwrites an existing non-null report'
);

select is(
  (select result_payload ->> 'overall_score'
   from app.assessment_attempts
   where attempt_id = '86000000-0000-4000-8000-000000000001'),
  '100.00',
  'Existing report remains unchanged after repeated backfill'
);

select throws_ok(
  $$ update app.assessment_attempts
     set result_payload = result_payload || '{"overall_score":0}'::jsonb
     where attempt_id = '86000000-0000-4000-8000-000000000001' $$,
  '55000',
  'Assessment result payloads are immutable',
  'Stored result payload cannot be replaced'
);

select throws_ok(
  $$ update app.assessment_attempts
     set result_payload = null
     where attempt_id = '86000000-0000-4000-8000-000000000001' $$,
  '55000',
  'Assessment result payloads are immutable',
  'Stored result payload cannot be removed'
);

select * from finish();
rollback;
