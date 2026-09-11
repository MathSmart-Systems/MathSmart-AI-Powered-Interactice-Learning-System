-- Assessment membership must never cross grade boundaries.

begin;

create extension if not exists pgtap with schema extensions;
select * from no_plan();

select ok(
  (select pg_proc.prosecdef
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.proname = 'enforce_assessment_question_grade_consistency'),
  'Authoring grade-consistency trigger function is SECURITY DEFINER'
);

select ok(
  (select pg_proc.proconfig @> array['search_path=""']
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.proname = 'enforce_assessment_question_grade_consistency'),
  'Authoring grade-consistency trigger function has empty search_path'
);

select ok(
  not has_function_privilege(
    'public', 'app.assessment_question_grades_match(uuid)', 'execute')
  and not has_function_privilege(
    'anon', 'app.assessment_question_grades_match(uuid)', 'execute')
  and not has_function_privilege(
    'authenticated', 'app.assessment_question_grades_match(uuid)', 'execute')
  and not has_function_privilege(
    'service_role', 'app.assessment_question_grades_match(uuid)', 'execute'),
  'Internal grade helper is not directly executable by application roles'
);

insert into app.grade_levels (grade_id, name, level) values
  ('65000000-0000-4000-8000-000000000005', 'Grade 5 consistency fixture', 5);

insert into app.competencies
  (competency_id, code, grade_id, domain, name, status)
values
  ('66000000-0000-4000-8000-000000000005', 'GRADE-GATE-5',
   '65000000-0000-4000-8000-000000000005', 'Numbers', 'Grade 5 fixture', 'published'),
  ('66000000-0000-4000-8000-000000000006', 'GRADE-GATE-6',
   (select grade_id from app.grade_levels where level = 6),
   'Numbers', 'Grade 6 fixture', 'published');

insert into app.questions
  (question_id, competency_id, question_type, prompt, answer_key, status)
values
  ('67000000-0000-4000-8000-000000000005',
   '66000000-0000-4000-8000-000000000005', 'number_input',
   'Grade 5 question?', '5'::jsonb, 'published'),
  ('67000000-0000-4000-8000-000000000006',
   '66000000-0000-4000-8000-000000000006', 'number_input',
   'Grade 6 question?', '6'::jsonb, 'published');

insert into app.assessments
  (assessment_id, grade_id, title, assessment_type, status, duration_minutes)
values
  ('68000000-0000-4000-8000-000000000006',
   (select grade_id from app.grade_levels where level = 6),
   'Grade consistency assessment', 'diagnostic', 'published', 20);

insert into app.assessment_questions (assessment_id, question_id, position)
values ('68000000-0000-4000-8000-000000000006',
        '67000000-0000-4000-8000-000000000006', 1);

select throws_ok(
  $$ insert into app.assessment_questions (assessment_id, question_id, position)
     values ('68000000-0000-4000-8000-000000000006',
             '67000000-0000-4000-8000-000000000005', 2) $$,
  'P0004',
  'Assessment questions must match the assessment grade',
  'Membership insertion rejects a question from another grade'
);

select throws_ok(
  $$ update app.assessments
     set grade_id = '65000000-0000-4000-8000-000000000005'
     where assessment_id = '68000000-0000-4000-8000-000000000006' $$,
  'P0004',
  'Assessment questions must match the assessment grade',
  'Assessment grade mutation rejects existing wrong-grade membership'
);

select throws_ok(
  $$ update app.questions
     set competency_id = '66000000-0000-4000-8000-000000000005'
     where question_id = '67000000-0000-4000-8000-000000000006' $$,
  'P0004',
  'Assessment questions must match the assessment grade',
  'Question competency mutation rejects existing wrong-grade membership'
);

select throws_ok(
  $$ update app.competencies
     set grade_id = '65000000-0000-4000-8000-000000000005'
     where competency_id = '66000000-0000-4000-8000-000000000006' $$,
  'P0004',
  'Assessment questions must match the assessment grade',
  'Competency grade mutation rejects existing wrong-grade membership'
);

-- Simulate legacy/corrupt membership to prove attempt insertion independently
-- fails closed even if authoring enforcement was bypassed.
alter table app.assessment_questions
  disable trigger assessment_questions_grade_consistency;
insert into app.assessment_questions (assessment_id, question_id, position)
values ('68000000-0000-4000-8000-000000000006',
        '67000000-0000-4000-8000-000000000005', 2);
alter table app.assessment_questions
  enable trigger assessment_questions_grade_consistency;

insert into auth.users (id, email)
values ('69000000-0000-4000-8000-000000000006', 'grade.gate@mathsmart.test');
insert into app.user_profiles (user_id, full_name, email, role)
values ('69000000-0000-4000-8000-000000000006', 'Grade Gate Learner',
        'grade.gate@mathsmart.test', 'student');
insert into app.student_profiles (user_id, learner_id, grade_id)
values ('69000000-0000-4000-8000-000000000006', 'LRN-GATE06',
        (select grade_id from app.grade_levels where level = 6));

set local request.jwt.claims =
  '{"sub":"69000000-0000-4000-8000-000000000006","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select throws_ok(
  $$ select app.start_assessment_attempt(
       '68000000-0000-4000-8000-000000000006') $$,
  'P0004',
  'The assessment has no complete published question set',
  'Attempt start fails closed for legacy or concurrently corrupted membership'
);

reset role;
select is(
  (select count(*) from app.assessment_attempts
   where assessment_id = '68000000-0000-4000-8000-000000000006'),
  0::bigint,
  'Failed start creates no attempt'
);

select * from finish();
rollback;
