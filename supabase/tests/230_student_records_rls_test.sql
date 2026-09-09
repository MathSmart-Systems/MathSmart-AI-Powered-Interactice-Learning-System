-- MathSmart Phase 3 — learner-record Row Level Security behaviour.
--
-- Asserts learner ownership, cross-learner denial from both sides, the
-- documented school-wide Teacher/Administrator read, and the rule that makes
-- this phase different from the earlier two: every one of these seven tables is
-- read-only through the Data API roles, because everything in them is
-- calculated by deterministic application code.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures, created as the migration owner
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a4000000-0000-4000-8000-0000000000a1', 'records.adviser@mathsmart.test'),
  ('b4000000-0000-4000-8000-0000000000b1', 'records.rls.one@mathsmart.test'),
  ('b4000000-0000-4000-8000-0000000000b2', 'records.rls.two@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('a4000000-0000-4000-8000-0000000000a1', 'Records Adviser', 'records.adviser@mathsmart.test', 'teacher_admin'),
  ('b4000000-0000-4000-8000-0000000000b1', 'Records RLS One', 'records.rls.one@mathsmart.test', 'student'),
  ('b4000000-0000-4000-8000-0000000000b2', 'Records RLS Two', 'records.rls.two@mathsmart.test', 'student');

insert into app.teacher_admin_profiles (user_id, employee_id, school_name, division_name) values
  ('a4000000-0000-4000-8000-0000000000a1', 'EMP-4001', 'Sample Central Elementary School', 'Sample Division');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('54000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-0000000000b1', 'LRN-400001',
   (select grade_id from app.grade_levels where level = 6)),
  ('54000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-0000000000b2', 'LRN-400002',
   (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('c4000000-0000-4000-8000-000000000001', 'RLSREC-COMP-1',
   (select grade_id from app.grade_levels where level = 6), 'Number Sense', 'RLS records competency', 'published');

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective, short_explanation, status, order_index)
values
  ('d4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
   'RLS records module', 20, 'Objective', 'Explanation', 'published', 1);

insert into app.activities (activity_id, module_id, title, estimated_minutes, status) values
  ('a4000000-0000-4000-8000-000000000011', 'd4000000-0000-4000-8000-000000000001',
   'RLS records activity', 15, 'published');

insert into app.questions (question_id, competency_id, question_type, prompt, choices, answer_key, status) values
  ('e4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
   'number_input', 'RLS records prompt', '[]'::jsonb, '{"value":3}'::jsonb, 'published');

insert into app.assessments (assessment_id, grade_id, title, assessment_type, status, duration_minutes) values
  ('f4000000-0000-4000-8000-000000000001',
   (select grade_id from app.grade_levels where level = 6), 'RLS records diagnostic', 'diagnostic', 'published', 45);

-- One attempt each, with its own evidence.
insert into app.assessment_attempts
  (attempt_id, assessment_id, student_id, status, submitted_at, overall_score)
values
  ('14000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001',
   '54000000-0000-4000-8000-000000000001', 'scored', now(), 40.00),
  ('14000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000001',
   '54000000-0000-4000-8000-000000000002', 'scored', now(), 90.00);

insert into app.assessment_responses (attempt_id, question_id, answer, is_correct) values
  ('14000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', '{"value":2}'::jsonb, false),
  ('14000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000001', '{"value":3}'::jsonb, true);

insert into app.competency_results
  (attempt_id, competency_id, raw_score, max_score, percentage, mastery_band)
values
  ('14000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 4, 10, 40.00, 'Needs Improvement'),
  ('14000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 9, 10, 90.00, 'Mastered');

insert into app.learning_path_items (student_id, competency_id, module_id, priority, status) values
  ('54000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
   'd4000000-0000-4000-8000-000000000001', 1, 'available'),
  ('54000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001',
   'd4000000-0000-4000-8000-000000000001', 1, 'completed');

insert into app.student_module_progress (student_id, module_id, completion_percentage, started_at) values
  ('54000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 25.00, now()),
  ('54000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001', 75.00, now());

insert into app.activity_attempts
  (student_id, activity_id, attempt_number, status, submitted_at,
   score_percentage, passed, mastery_status)
values
  ('54000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000011',
   1, 'scored', now(), 40.00, false, 'Needs Improvement'),
  ('54000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000011',
   1, 'scored', now(), 90.00, true, 'Mastered');

insert into app.competency_progress
  (student_id, competency_id, diagnostic_score, current_score, mastery_band, attempt_count, unsuccessful_attempts)
values
  ('54000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 40.00, 40.00, 'Needs Improvement', 2, 2),
  ('54000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 90.00, 90.00, 'Mastered', 1, 0);

-- ===========================================================================
-- Anonymous callers
-- ===========================================================================
reset role;
set local request.jwt.claims = '';
set local role anon;

select throws_ok($$ select 1 from app.assessment_attempts $$,     '42501', null::text, 'An anonymous caller cannot read assessment attempts');
select throws_ok($$ select 1 from app.assessment_responses $$,    '42501', null::text, 'An anonymous caller cannot read assessment responses');
select throws_ok($$ select 1 from app.competency_results $$,      '42501', null::text, 'An anonymous caller cannot read competency results');
select throws_ok($$ select 1 from app.learning_path_items $$,     '42501', null::text, 'An anonymous caller cannot read learning paths');
select throws_ok($$ select 1 from app.student_module_progress $$, '42501', null::text, 'An anonymous caller cannot read module progress');
select throws_ok($$ select 1 from app.activity_attempts $$,       '42501', null::text, 'An anonymous caller cannot read activity attempts');
select throws_ok($$ select 1 from app.competency_progress $$,     '42501', null::text, 'An anonymous caller cannot read competency progress');

-- ===========================================================================
-- Learner One reads only their own evidence
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"b4000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is((select count(*) from app.assessment_attempts
            where assessment_attempts.assessment_id = 'f4000000-0000-4000-8000-000000000001'), 1::bigint,
          'A learner sees only their own assessment attempt');

select is((select overall_score from app.assessment_attempts
            where assessment_attempts.assessment_id = 'f4000000-0000-4000-8000-000000000001'), 40.00::numeric,
          'The attempt a learner sees is their own');

select is_empty($$ select 1 from app.assessment_attempts
                   where assessment_attempts.attempt_id = '14000000-0000-4000-8000-000000000002' $$,
                'A learner cannot read another learner''s attempt');

select is((select count(*) from app.assessment_responses
            where assessment_responses.question_id = 'e4000000-0000-4000-8000-000000000001'), 1::bigint,
          'A learner sees only their own responses');

select is_empty($$ select 1 from app.assessment_responses
                   where assessment_responses.attempt_id = '14000000-0000-4000-8000-000000000002' $$,
                'A learner cannot read another learner''s responses');

select is((select count(*) from app.competency_results
            where competency_results.competency_id = 'c4000000-0000-4000-8000-000000000001'), 1::bigint,
          'A learner sees only their own competency results');

select is((select mastery_band from app.competency_results
            where competency_results.competency_id = 'c4000000-0000-4000-8000-000000000001'),
          'Needs Improvement'::app.mastery_band,
          'The result a learner sees is their own, not the higher-scoring peer''s');

select is((select count(*) from app.learning_path_items
            where learning_path_items.competency_id = 'c4000000-0000-4000-8000-000000000001'), 1::bigint,
          'A learner sees only their own learning path');

select is((select status from app.learning_path_items
            where learning_path_items.competency_id = 'c4000000-0000-4000-8000-000000000001'),
          'available'::app.path_item_status,
          'The path item a learner sees is their own');

select is((select count(*) from app.student_module_progress
            where student_module_progress.module_id = 'd4000000-0000-4000-8000-000000000001'), 1::bigint,
          'A learner sees only their own module progress');

select is((select completion_percentage from app.student_module_progress
            where student_module_progress.module_id = 'd4000000-0000-4000-8000-000000000001'), 25.00::numeric,
          'The module progress a learner sees is their own');

select is((select count(*) from app.activity_attempts
            where activity_attempts.activity_id = 'a4000000-0000-4000-8000-000000000011'), 1::bigint,
          'A learner sees only their own activity attempts');

select is((select count(*) from app.competency_progress
            where competency_progress.competency_id = 'c4000000-0000-4000-8000-000000000001'), 1::bigint,
          'A learner sees only their own competency progress');

select is((select current_score from app.competency_progress
            where competency_progress.competency_id = 'c4000000-0000-4000-8000-000000000001'), 40.00::numeric,
          'The competency progress a learner sees is their own');

-- ---------------------------------------------------------------------------
-- A learner cannot write any official record
-- ---------------------------------------------------------------------------
-- Every one of these is a privilege denial, not a policy denial: the role holds
-- no INSERT, UPDATE or DELETE on any learner-record table at all.
select throws_ok(
  $$ update app.assessment_attempts set overall_score = 100
     where assessment_attempts.attempt_id = '14000000-0000-4000-8000-000000000001' $$,
  '42501', null::text, 'A learner cannot change their own assessment score');

select throws_ok(
  $$ update app.competency_results set mastery_band = 'Mastered', raw_score = 10, percentage = 100
     where competency_results.attempt_id = '14000000-0000-4000-8000-000000000001' $$,
  '42501', null::text, 'A learner cannot change their own competency result or its mastery band');

select throws_ok(
  $$ update app.competency_progress set current_score = 100, mastery_band = 'Mastered'
     where competency_progress.student_id = '54000000-0000-4000-8000-000000000001' $$,
  '42501', null::text, 'A learner cannot change their own mastery');

select throws_ok(
  $$ update app.student_module_progress set completion_percentage = 100, is_complete = true
     where student_module_progress.student_id = '54000000-0000-4000-8000-000000000001' $$,
  '42501', null::text, 'A learner cannot mark their own module complete directly');

select throws_ok(
  $$ update app.learning_path_items set status = 'completed'
     where learning_path_items.student_id = '54000000-0000-4000-8000-000000000001' $$,
  '42501', null::text, 'A learner cannot advance their own learning path directly');

select throws_ok(
  $$ update app.activity_attempts set score_percentage = 100, passed = true
     where activity_attempts.student_id = '54000000-0000-4000-8000-000000000001' $$,
  '42501', null::text, 'A learner cannot rewrite their own activity attempt');

select throws_ok(
  $$ insert into app.assessment_attempts (assessment_id, student_id)
     values ('f4000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001') $$,
  '42501', null::text, 'A learner cannot start an attempt directly');

select throws_ok(
  $$ insert into app.activity_attempts
       (student_id, activity_id, attempt_number, score_percentage, passed, mastery_status)
     values ('54000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000011',
             2, 100, true, 'Mastered') $$,
  '42501', null::text, 'A learner cannot record their own activity attempt directly');

select throws_ok(
  $$ delete from app.assessment_attempts
     where assessment_attempts.attempt_id = '14000000-0000-4000-8000-000000000001' $$,
  '42501', null::text, 'A learner cannot delete their own attempt history');

select throws_ok(
  $$ update app.assessment_attempts set overall_score = 0
     where assessment_attempts.attempt_id = '14000000-0000-4000-8000-000000000002' $$,
  '42501', null::text, 'A learner cannot change another learner''s score');

-- ===========================================================================
-- Learner Two — isolation from the other side
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"b4000000-0000-4000-8000-0000000000b2","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is((select overall_score from app.assessment_attempts
            where assessment_attempts.assessment_id = 'f4000000-0000-4000-8000-000000000001'), 90.00::numeric,
          'The second learner reads only their own attempt');

select is_empty($$ select 1 from app.competency_results
                   where competency_results.attempt_id = '14000000-0000-4000-8000-000000000001' $$,
                'The second learner cannot read the first learner''s competency result');

select is_empty($$ select 1 from app.activity_attempts
                   where activity_attempts.student_id = '54000000-0000-4000-8000-000000000001' $$,
                'The second learner cannot read the first learner''s activity attempts');

select is_empty($$ select 1 from app.competency_progress
                   where competency_progress.student_id = '54000000-0000-4000-8000-000000000001' $$,
                'The second learner cannot read the first learner''s mastery');

-- ===========================================================================
-- Teacher/Administrator — school-wide read, no writes
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"a4000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is((select count(*) from app.assessment_attempts
            where assessment_attempts.assessment_id = 'f4000000-0000-4000-8000-000000000001'), 2::bigint,
          'A teacher_admin reads assessment attempts school-wide');

select is((select count(*) from app.assessment_responses
            where assessment_responses.question_id = 'e4000000-0000-4000-8000-000000000001'), 2::bigint,
          'A teacher_admin reads assessment responses school-wide');

select is((select count(*) from app.competency_results
            where competency_results.competency_id = 'c4000000-0000-4000-8000-000000000001'), 2::bigint,
          'A teacher_admin reads competency results school-wide');

select is((select count(*) from app.learning_path_items
            where learning_path_items.competency_id = 'c4000000-0000-4000-8000-000000000001'), 2::bigint,
          'A teacher_admin reads learning paths school-wide');

select is((select count(*) from app.student_module_progress
            where student_module_progress.module_id = 'd4000000-0000-4000-8000-000000000001'), 2::bigint,
          'A teacher_admin reads module progress school-wide');

select is((select count(*) from app.activity_attempts
            where activity_attempts.activity_id = 'a4000000-0000-4000-8000-000000000011'), 2::bigint,
          'A teacher_admin reads activity attempts school-wide');

select is((select count(*) from app.competency_progress
            where competency_progress.competency_id = 'c4000000-0000-4000-8000-000000000001'), 2::bigint,
          'A teacher_admin reads competency progress school-wide');

-- The at-risk signal a Teacher/Administrator actually needs is readable.
select is((select unsuccessful_attempts from app.competency_progress
            where competency_progress.student_id = '54000000-0000-4000-8000-000000000001'
              and competency_progress.competency_id = 'c4000000-0000-4000-8000-000000000001'), 2,
          'A teacher_admin can see the unsuccessful attempts that drive the intervention trigger');

-- A calculated record is not editable by anyone through the Data API roles.
select throws_ok(
  $$ update app.competency_results set mastery_band = 'Mastered', raw_score = 10, percentage = 100
     where competency_results.attempt_id = '14000000-0000-4000-8000-000000000001' $$,
  '42501', null::text,
  'A teacher_admin cannot rewrite a competency result; grade correction is an audited backend operation');

select throws_ok(
  $$ update app.competency_progress set current_score = 100, mastery_band = 'Mastered'
     where competency_progress.student_id = '54000000-0000-4000-8000-000000000001' $$,
  '42501', null::text,
  'A teacher_admin cannot rewrite a learner''s mastery');

select throws_ok(
  $$ delete from app.assessment_attempts
     where assessment_attempts.attempt_id = '14000000-0000-4000-8000-000000000001' $$,
  '42501', null::text,
  'A teacher_admin cannot delete attempt history');

select throws_ok(
  $$ insert into app.activity_attempts
       (student_id, activity_id, attempt_number, score_percentage, passed, mastery_status)
     values ('54000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000011',
             2, 100, true, 'Mastered') $$,
  '42501', null::text,
  'A teacher_admin cannot fabricate an activity attempt');

-- ===========================================================================
-- Untrusted and unrecognised claims
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"b4000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"},"user_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is((select count(*) from app.competency_progress
            where competency_progress.competency_id = 'c4000000-0000-4000-8000-000000000001'), 1::bigint,
          'A teacher_admin role in user_metadata does not widen a learner''s record access');

reset role;
set local request.jwt.claims = '{"sub":"a4000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
set local role authenticated;

select is((select count(*) from app.competency_progress
            where competency_progress.competency_id = 'c4000000-0000-4000-8000-000000000001'), 0::bigint,
          'A token with no role claim reads no learner records');

reset role;

select * from finish();

rollback;
