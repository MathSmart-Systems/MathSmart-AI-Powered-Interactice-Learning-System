-- MathSmart Phase 2 — learning-content Row Level Security behaviour.
--
-- Impersonates each caller the way PostgREST does and asserts what a learner may
-- consume, what stays hidden until publication, and what only a
-- Teacher/Administrator may author.
--
-- The answer-key assertions are the heart of this file. A learner must never be
-- able to reach a correct answer before submission, and neither must anyone else
-- through the Data API roles: reading an answer key is a service_role operation.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures, created as the migration owner
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a2000000-0000-4000-8000-0000000000a1', 'content.adviser@mathsmart.test'),
  ('b2000000-0000-4000-8000-0000000000b1', 'content.learner@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('a2000000-0000-4000-8000-0000000000a1', 'Content Adviser', 'content.adviser@mathsmart.test', 'teacher_admin'),
  ('b2000000-0000-4000-8000-0000000000b1', 'Content Learner', 'content.learner@mathsmart.test', 'student');

insert into app.teacher_admin_profiles (user_id, employee_id, school_name, division_name) values
  ('a2000000-0000-4000-8000-0000000000a1', 'EMP-7001', 'Sample Central Elementary School', 'Sample Division');

insert into app.student_profiles (user_id, learner_id, grade_id) values
  ('b2000000-0000-4000-8000-0000000000b1', 'LRN-700001',
   (select grade_id from app.grade_levels where level = 6));

-- C1 is published, C2 is a draft.
insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('c2000000-0000-4000-8000-000000000001', 'RLS-COMP-1',
   (select grade_id from app.grade_levels where level = 6), 'Number Sense', 'Published competency', 'published'),
  ('c2000000-0000-4000-8000-000000000002', 'RLS-COMP-2',
   (select grade_id from app.grade_levels where level = 6), 'Geometry', 'Draft competency', 'draft');

-- M1 published under a published competency, M2 a draft, M3 published but under
-- the draft competency.
insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective, short_explanation, status, order_index)
values
  ('d2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
   'Visible module', 20, 'Objective', 'Explanation', 'published', 1),
  ('d2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001',
   'Draft module', 20, 'Objective', 'Explanation', 'draft', 2),
  ('d2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000002',
   'Module under draft competency', 20, 'Objective', 'Explanation', 'published', 1);

insert into app.questions
  (question_id, competency_id, question_type, prompt, choices, answer_key, explanation, hint, status)
values
  ('e2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
   'multiple_choice', 'Visible question', '["1","2"]'::jsonb, '{"choice":"2"}'::jsonb,
   'Secret explanation', 'Secret hint', 'published'),
  ('e2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001',
   'number_input', 'Draft question', '[]'::jsonb, '{"value":7}'::jsonb, null, null, 'draft'),
  ('e2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000002',
   'number_input', 'Question under draft competency', '[]'::jsonb, '{"value":9}'::jsonb, null, null, 'published');

insert into app.assessments (assessment_id, grade_id, title, assessment_type, status, duration_minutes) values
  ('f2000000-0000-4000-8000-000000000001',
   (select grade_id from app.grade_levels where level = 6), 'Published diagnostic', 'diagnostic', 'published', 45),
  ('f2000000-0000-4000-8000-000000000002',
   (select grade_id from app.grade_levels where level = 6), 'Draft quiz', 'unit_quiz', 'draft', 20);

insert into app.assessment_questions (assessment_id, question_id, position) values
  ('f2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 1),
  ('f2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 1);

-- X1 is reachable, X2 is published under the draft module, X3 is a draft.
insert into app.activities (activity_id, module_id, title, estimated_minutes, status) values
  ('a2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
   'Visible activity', 15, 'published'),
  ('a2000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002',
   'Activity under draft module', 15, 'published'),
  ('a2000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001',
   'Draft activity', 15, 'draft');

insert into app.activity_questions (activity_id, question_id, position) values
  ('a2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 1),
  ('a2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 1);

-- ===========================================================================
-- Anonymous callers
-- ===========================================================================
reset role;
set local request.jwt.claims = '';
set local role anon;

select throws_ok($$ select 1 from app.competencies $$,         '42501', null::text, 'An anonymous caller cannot read competencies');
select throws_ok($$ select 1 from app.learning_modules $$,     '42501', null::text, 'An anonymous caller cannot read learning modules');
select throws_ok($$ select 1 from app.questions $$,            '42501', null::text, 'An anonymous caller cannot read questions');
select throws_ok($$ select 1 from app.assessments $$,          '42501', null::text, 'An anonymous caller cannot read assessments');
select throws_ok($$ select 1 from app.assessment_questions $$, '42501', null::text, 'An anonymous caller cannot read assessment membership');
select throws_ok($$ select 1 from app.activities $$,           '42501', null::text, 'An anonymous caller cannot read activities');
select throws_ok($$ select 1 from app.activity_questions $$,   '42501', null::text, 'An anonymous caller cannot read activity membership');

-- ===========================================================================
-- A learner consumes published content only
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"b2000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is((select count(*) from app.competencies), 1::bigint,
          'A learner sees published competencies only');

select is((select code from app.competencies), 'RLS-COMP-1',
          'The competency a learner sees is the published one');

select is((select count(*) from app.learning_modules), 1::bigint,
          'A learner sees a module only when the module and its competency are both published');

select is((select title from app.learning_modules), 'Visible module',
          'The module a learner sees is the published one under a published competency');

select is((select count(*) from app.questions), 1::bigint,
          'A learner sees a question only when the question and its competency are both published');

select is((select count(*) from app.assessments), 1::bigint,
          'A learner sees published assessments only');

select is((select count(*) from app.assessment_questions), 1::bigint,
          'A learner sees assessment membership only for an assessment they can see');

select is((select count(*) from app.activities), 1::bigint,
          'A learner sees an activity only when the activity and its module are both published');

select is((select count(*) from app.activity_questions), 1::bigint,
          'A learner sees activity membership only for an activity they can see');

-- ---------------------------------------------------------------------------
-- Answer keys, explanations and hints are unreachable
-- ---------------------------------------------------------------------------
select throws_ok($$ select answer_key from app.questions $$,
                 '42501', null::text, 'A learner cannot read an answer key');
select throws_ok($$ select explanation from app.questions $$,
                 '42501', null::text, 'A learner cannot read a stored explanation');
select throws_ok($$ select hint from app.questions $$,
                 '42501', null::text, 'A learner cannot read a stored hint');
select throws_ok($$ select * from app.questions $$,
                 '42501', null::text, 'A learner cannot select every question column, because the answer key is one of them');
select throws_ok($$ select count(*) from app.questions where answer_key is not null $$,
                 '42501', null::text, 'A learner cannot filter on the answer key to infer it');

-- The delivery shape a learner does need still works.
select is((select prompt from app.questions), 'Visible question',
          'A learner reads the question prompt');
select is((select jsonb_array_length(choices) from app.questions), 2,
          'A learner reads the question choices');

-- ---------------------------------------------------------------------------
-- A learner cannot author, publish or archive content
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.competencies (code, grade_id, domain, name)
     values ('RLS-COMP-9', (select grade_id from app.grade_levels where level = 6), 'Number Sense', 'Rogue') $$,
  '42501', null::text, 'A learner cannot create a competency');

select throws_ok(
  $$ insert into app.learning_modules
       (competency_id, title, estimated_minutes, learning_objective, short_explanation, order_index)
     values ('c2000000-0000-4000-8000-000000000001', 'Rogue module', 10, 'Objective', 'Explanation', 9) $$,
  '42501', null::text, 'A learner cannot create a learning module');

select throws_ok(
  $$ insert into app.questions (competency_id, question_type, prompt, answer_key)
     values ('c2000000-0000-4000-8000-000000000001', 'number_input', 'Rogue question', '{"value":1}'::jsonb) $$,
  '42501', null::text, 'A learner cannot create a question');

select throws_ok(
  $$ insert into app.assessments (grade_id, title, assessment_type, duration_minutes)
     values ((select grade_id from app.grade_levels where level = 6), 'Rogue assessment', 'unit_quiz', 10) $$,
  '42501', null::text, 'A learner cannot create an assessment');

select throws_ok(
  $$ insert into app.activities (module_id, title, estimated_minutes)
     values ('d2000000-0000-4000-8000-000000000001', 'Rogue activity', 10) $$,
  '42501', null::text, 'A learner cannot create an activity');

select throws_ok(
  $$ insert into app.assessment_questions (assessment_id, question_id, position)
     values ('f2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 9) $$,
  '42501', null::text, 'A learner cannot change assessment membership');

select throws_ok(
  $$ delete from app.assessment_questions
     where assessment_questions.assessment_id = 'f2000000-0000-4000-8000-000000000001' $$,
  '42501', null::text, 'A learner cannot remove assessment membership');

select throws_ok(
  $$ delete from app.competencies
     where competencies.competency_id = 'c2000000-0000-4000-8000-000000000001' $$,
  '42501', null::text, 'A learner cannot delete a competency');

-- These match zero rows rather than raising, so the rows are re-read as the
-- owner below to prove they are untouched.
update app.competencies set status = 'draft'
where competencies.competency_id = 'c2000000-0000-4000-8000-000000000001';
update app.learning_modules set title = 'Tampered module'
where learning_modules.module_id = 'd2000000-0000-4000-8000-000000000001';
update app.questions set prompt = 'Tampered prompt'
where questions.question_id = 'e2000000-0000-4000-8000-000000000001';
update app.activities set mastery_threshold = 1
where activities.activity_id = 'a2000000-0000-4000-8000-000000000001';

reset role;

select is((select status from app.competencies
            where competencies.competency_id = 'c2000000-0000-4000-8000-000000000001'),
          'published'::app.publication_status,
          'A learner cannot unpublish a competency');

select is((select title from app.learning_modules
            where learning_modules.module_id = 'd2000000-0000-4000-8000-000000000001'),
          'Visible module',
          'A learner cannot rewrite a learning module');

select is((select prompt from app.questions
            where questions.question_id = 'e2000000-0000-4000-8000-000000000001'),
          'Visible question',
          'A learner cannot rewrite a question');

select is((select mastery_threshold from app.activities
            where activities.activity_id = 'a2000000-0000-4000-8000-000000000001'),
          75,
          'A learner cannot lower an activity pass threshold');

-- ===========================================================================
-- A Teacher/Administrator manages curriculum content
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is((select count(*) from app.competencies), 2::bigint,
          'A teacher_admin reads every competency, including drafts');
select is((select count(*) from app.learning_modules), 3::bigint,
          'A teacher_admin reads every learning module');
select is((select count(*) from app.questions), 3::bigint,
          'A teacher_admin reads every question');
select is((select count(*) from app.assessments), 2::bigint,
          'A teacher_admin reads every assessment');
select is((select count(*) from app.activities), 3::bigint,
          'A teacher_admin reads every activity');
select is((select count(*) from app.assessment_questions), 2::bigint,
          'A teacher_admin reads every assessment membership row');

-- An answer key stays out of reach even here: reading one is a service_role
-- operation performed by FastAPI, never a Data API role.
select throws_ok($$ select answer_key from app.questions $$,
                 '42501', null::text,
                 'Even a teacher_admin cannot read an answer key through the Data API roles');

-- Authoring, proved by re-reading each write.
insert into app.competencies (competency_id, code, grade_id, domain, name)
values ('c2000000-0000-4000-8000-000000000009', 'RLS-COMP-9',
        (select grade_id from app.grade_levels where level = 6), 'Measurement', 'Authored competency');

select is((select name from app.competencies
            where competencies.competency_id = 'c2000000-0000-4000-8000-000000000009'),
          'Authored competency',
          'A teacher_admin can create a competency');

insert into app.learning_modules
  (competency_id, title, estimated_minutes, learning_objective, short_explanation, order_index)
values ('c2000000-0000-4000-8000-000000000009', 'Authored module', 30, 'Objective', 'Explanation', 1);

select is((select count(*) from app.learning_modules
            where learning_modules.title = 'Authored module'),
          1::bigint,
          'A teacher_admin can create a learning module');

insert into app.questions (competency_id, question_type, prompt, answer_key, explanation, hint)
values ('c2000000-0000-4000-8000-000000000009', 'number_input', 'Authored question',
        '{"value":11}'::jsonb, 'Authored explanation', 'Authored hint');

select is((select count(*) from app.questions where questions.prompt = 'Authored question'),
          1::bigint,
          'A teacher_admin can author a question together with its answer key');

update app.competencies set status = 'published'
where competencies.competency_id = 'c2000000-0000-4000-8000-000000000009';

select is((select status from app.competencies
            where competencies.competency_id = 'c2000000-0000-4000-8000-000000000009'),
          'published'::app.publication_status,
          'A teacher_admin can publish a competency');

update app.learning_modules set status = 'archived'
where learning_modules.module_id = 'd2000000-0000-4000-8000-000000000002';

select is((select status from app.learning_modules
            where learning_modules.module_id = 'd2000000-0000-4000-8000-000000000002'),
          'archived'::app.publication_status,
          'A teacher_admin can archive a learning module');

-- Ordered membership can be replaced atomically.
delete from app.assessment_questions
where assessment_questions.assessment_id = 'f2000000-0000-4000-8000-000000000001';

insert into app.assessment_questions (assessment_id, question_id, position) values
  ('f2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 1),
  ('f2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 2);

select is(
  (select string_agg(assessment_questions.question_id::text, ',' order by assessment_questions.position)
   from app.assessment_questions
   where assessment_questions.assessment_id = 'f2000000-0000-4000-8000-000000000001'),
  'e2000000-0000-4000-8000-000000000002,e2000000-0000-4000-8000-000000000001',
  'A teacher_admin can replace an assessment''s ordered question membership'
);

-- Still denied, even school-wide.
select throws_ok(
  $$ delete from app.questions where questions.prompt = 'Authored question' $$,
  '42501', null::text,
  'A teacher_admin cannot delete a question; archiving is the supported path');

select throws_ok(
  $$ delete from app.activities where activities.title = 'Draft activity' $$,
  '42501', null::text,
  'A teacher_admin cannot delete an activity');

-- ===========================================================================
-- Untrusted and unrecognised claims
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"b2000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"},"user_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is((select count(*) from app.competencies where competencies.status = 'draft'), 0::bigint,
          'A teacher_admin role in user_metadata does not reveal draft content');

reset role;
set local request.jwt.claims = '{"sub":"b2000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
set local role authenticated;

select is((select count(*) from app.competencies where competencies.status = 'draft'), 0::bigint,
          'A token with no role claim does not reveal draft content');

reset role;

select * from finish();

rollback;
