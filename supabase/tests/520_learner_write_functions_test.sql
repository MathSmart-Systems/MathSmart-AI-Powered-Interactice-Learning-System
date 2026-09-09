-- MathSmart Phase 5 — the learner's own writes.
--
-- Every learner-record table is SELECT-only for `authenticated`, so a learner
-- records their progress through a function instead of a grant. These tests
-- prove the function is safe to be SECURITY DEFINER: the learner comes from
-- auth.uid(), the percentage is computed from the module rather than supplied,
-- and neither a repeated section nor an invented one can move it.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Shape and hardening
-- ---------------------------------------------------------------------------
select has_function('app'::name, 'module_section_ids'::name, 'app.module_section_ids exists');
select has_function('app'::name, 'save_module_progress'::name, 'app.save_module_progress exists');
select has_function('app'::name, 'complete_module'::name, 'app.complete_module exists');

select ok(
  (select bool_and(pg_proc.prosecdef)
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.proname in ('module_section_ids', 'save_module_progress', 'complete_module')),
  'The learner write functions are SECURITY DEFINER, because the tables are SELECT-only for the caller'
);

select ok(
  (select bool_and(pg_proc.proconfig::text like '%search_path%')
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.proname in ('module_section_ids', 'save_module_progress', 'complete_module')),
  'The learner write functions pin their search_path'
);

select ok(
  not has_function_privilege(
    'anon', 'app.save_module_progress(uuid, text[], text)', 'execute'
  ),
  'anon cannot execute app.save_module_progress'
);
select ok(
  has_function_privilege(
    'authenticated', 'app.save_module_progress(uuid, text[], text)', 'execute'
  ),
  'authenticated can execute app.save_module_progress'
);
select ok(not has_function_privilege('anon', 'app.complete_module(uuid)', 'execute'),
          'anon cannot execute app.complete_module');

-- The grant that was deliberately not added.
select ok(not has_table_privilege('authenticated', 'app.student_module_progress', 'insert'),
          'authenticated still holds no INSERT on app.student_module_progress');
select ok(not has_table_privilege('authenticated', 'app.student_module_progress', 'update'),
          'authenticated still holds no UPDATE on app.student_module_progress');

-- ---------------------------------------------------------------------------
-- Fixture: one competency, one module with one rule and one worked example,
-- and two learners.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('b9000000-0000-4000-8000-0000000000b1', 'write.one@mathsmart.test'),
  ('b9000000-0000-4000-8000-0000000000b2', 'write.two@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('b9000000-0000-4000-8000-0000000000b1', 'Write Learner One',
   'write.one@mathsmart.test', 'student'),
  ('b9000000-0000-4000-8000-0000000000b2', 'Write Learner Two',
   'write.two@mathsmart.test', 'student');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('59000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-0000000000b1',
   'LRN-900001', (select grade_id from app.grade_levels where level = 6)),
  ('59000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-0000000000b2',
   'LRN-900002', (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('c9000000-0000-4000-8000-000000000001', 'WRITE-COMP-1',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Learner write competency', 'published');

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective,
   short_explanation, rules, worked_examples, status, order_index)
values (
  'd9000000-0000-4000-8000-000000000001',
  'c9000000-0000-4000-8000-000000000001',
  'Learner write module', 15, 'Apply the rule.', 'Equal signs give a positive result.',
  '[{"title": "Same signs"}]'::jsonb,
  '[{"problem": "(-6) x (-4)"}]'::jsonb,
  'published', 1
);

-- ---------------------------------------------------------------------------
-- The sections come from the module's own content
-- ---------------------------------------------------------------------------
select is(
  app.module_section_ids('d9000000-0000-4000-8000-000000000001'),
  array['objective', 'concept', 'rule_1', 'example_1'],
  'A module with one rule and one worked example has four sections'
);

-- ---------------------------------------------------------------------------
-- A learner saves their own progress
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"b9000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select save.completion_percentage
   from app.save_module_progress(
     'd9000000-0000-4000-8000-000000000001', array['objective', 'concept']
   ) as save),
  50.00::numeric(5,2),
  'Two sections of four is fifty percent'
);

select is(
  (select save.completion_percentage
   from app.save_module_progress(
     'd9000000-0000-4000-8000-000000000001',
     array['objective', 'objective', 'objective', 'objective']
   ) as save),
  25.00::numeric(5,2),
  'A repeated section does not inflate the percentage'
);

select is(
  (select save.completion_percentage
   from app.save_module_progress(
     'd9000000-0000-4000-8000-000000000001', array['objective', 'invented_section']
   ) as save),
  25.00::numeric(5,2),
  'A section the module does not have is ignored'
);

select is(
  (select count(*) from app.student_module_progress
   where student_module_progress.module_id = 'd9000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Saving twice updates one row rather than creating a second'
);

-- ---------------------------------------------------------------------------
-- Completion needs every section
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select * from app.complete_module('d9000000-0000-4000-8000-000000000001') $$,
  'A module with unfinished sections does not complete'
);

select is(
  (select save.is_complete
   from app.save_module_progress(
     'd9000000-0000-4000-8000-000000000001',
     array['objective', 'concept', 'rule_1', 'example_1']
   ) as save),
  true,
  'Every section finished completes the module'
);

select ok(
  (select completed.completed_at from app.complete_module(
     'd9000000-0000-4000-8000-000000000001'
   ) as completed) is not null,
  'Completing a finished module stamps completed_at'
);

-- ---------------------------------------------------------------------------
-- The row belongs to the caller, and to nobody else
-- ---------------------------------------------------------------------------
select is(
  (select student_module_progress.student_id
   from app.student_module_progress
   where student_module_progress.module_id = 'd9000000-0000-4000-8000-000000000001'),
  '59000000-0000-4000-8000-000000000001'::uuid,
  'The row belongs to the learner who called, taken from auth.uid()'
);

reset role;
set local request.jwt.claims = '{"sub":"b9000000-0000-4000-8000-0000000000b2","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select count(*) from app.student_module_progress),
  0::bigint,
  'The second learner sees none of the first learner''s progress'
);

select is(
  (select save.completion_percentage
   from app.save_module_progress(
     'd9000000-0000-4000-8000-000000000001', array['objective']
   ) as save),
  25.00::numeric(5,2),
  'The second learner writes their own row, not the first learner''s'
);

reset role;

select is(
  (select count(*) from app.student_module_progress
   where student_module_progress.module_id = 'd9000000-0000-4000-8000-000000000001'),
  2::bigint,
  'Two learners hold two rows'
);

select is(
  (select student_module_progress.completion_percentage
   from app.student_module_progress
   where student_module_progress.student_id = '59000000-0000-4000-8000-000000000001'),
  100.00::numeric(5,2),
  'The first learner''s completed row was not touched by the second learner'
);

-- ---------------------------------------------------------------------------
-- Somebody with no learner profile cannot save progress at all
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a9000000-0000-4000-8000-0000000000a1', 'write.adviser@mathsmart.test');
insert into app.user_profiles (user_id, full_name, email, role) values
  ('a9000000-0000-4000-8000-0000000000a1', 'Write Adviser',
   'write.adviser@mathsmart.test', 'teacher_admin');
insert into app.teacher_admin_profiles (user_id, employee_id, school_name, division_name) values
  ('a9000000-0000-4000-8000-0000000000a1', 'EMP-9001', 'Sample School', 'Sample Division');

set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select throws_ok(
  $$ select app.save_module_progress('d9000000-0000-4000-8000-000000000001', array['objective']) $$,
  '42501',
  'Only a learner may save module progress',
  'A Teacher/Administrator has no learner record and cannot save module progress'
);

reset role;

select * from finish();
rollback;
