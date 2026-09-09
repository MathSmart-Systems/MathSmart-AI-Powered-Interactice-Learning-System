-- MathSmart Phase 3 — learner-record relationships and constraints.
--
-- Proves that attempt history accumulates, that duplicate evidence is rejected,
-- and that a stored score, percentage, band or completion figure cannot
-- disagree with its own evidence. Runs as the migration owner, so RLS is not
-- the subject here.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('b3000000-0000-4000-8000-0000000000b1', 'records.learner.one@mathsmart.test'),
  ('b3000000-0000-4000-8000-0000000000b2', 'records.learner.two@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('b3000000-0000-4000-8000-0000000000b1', 'Records Learner One', 'records.learner.one@mathsmart.test', 'student'),
  ('b3000000-0000-4000-8000-0000000000b2', 'Records Learner Two', 'records.learner.two@mathsmart.test', 'student');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('53000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-0000000000b1', 'LRN-300001',
   (select grade_id from app.grade_levels where level = 6)),
  ('53000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-0000000000b2', 'LRN-300002',
   (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('c3000000-0000-4000-8000-000000000001', 'REC-COMP-1',
   (select grade_id from app.grade_levels where level = 6), 'Number Sense', 'Records competency one', 'published'),
  ('c3000000-0000-4000-8000-000000000002', 'REC-COMP-2',
   (select grade_id from app.grade_levels where level = 6), 'Geometry', 'Records competency two', 'published');

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective, short_explanation, status, order_index)
values
  ('d3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
   'Records module one', 20, 'Objective', 'Explanation', 'published', 1),
  ('d3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002',
   'Records module two', 20, 'Objective', 'Explanation', 'published', 1);

insert into app.activities (activity_id, module_id, title, estimated_minutes, mastery_threshold, status) values
  ('a3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
   'Records activity one', 15, 75, 'published');

insert into app.questions (question_id, competency_id, question_type, prompt, choices, answer_key, status) values
  ('e3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
   'multiple_choice', 'Records prompt one', '["1","2"]'::jsonb, '{"choice":"1"}'::jsonb, 'published'),
  ('e3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001',
   'number_input', 'Records prompt two', '[]'::jsonb, '{"value":5}'::jsonb, 'published');

insert into app.assessments (assessment_id, grade_id, title, assessment_type, status, duration_minutes) values
  ('f3000000-0000-4000-8000-000000000001',
   (select grade_id from app.grade_levels where level = 6), 'Records diagnostic', 'diagnostic', 'published', 45),
  ('f3000000-0000-4000-8000-000000000002',
   (select grade_id from app.grade_levels where level = 6), 'Records reassessment', 'reassessment', 'published', 45);

-- ---------------------------------------------------------------------------
-- Attempt history accumulates
-- ---------------------------------------------------------------------------
insert into app.assessment_attempts (attempt_id, assessment_id, student_id, status) values
  ('11110000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
   '53000000-0000-4000-8000-000000000001', 'in_progress');

select is(
  (select status from app.assessment_attempts
    where assessment_attempts.attempt_id = '11110000-0000-4000-8000-000000000001'),
  'in_progress'::app.attempt_status,
  'An attempt starts in progress'
);

select throws_ok(
  $$ insert into app.assessment_attempts (assessment_id, student_id, status)
     values ('f3000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'in_progress') $$,
  '23505', null::text,
  'A learner resumes an attempt rather than starting a second one on the same assessment'
);

-- Finishing the first attempt frees the learner to take another.
update app.assessment_attempts
set status = 'scored', submitted_at = now(), overall_score = 62.50
where assessment_attempts.attempt_id = '11110000-0000-4000-8000-000000000001';

insert into app.assessment_attempts (attempt_id, assessment_id, student_id, status, submitted_at, overall_score) values
  ('11110000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000001',
   '53000000-0000-4000-8000-000000000001', 'scored', now(), 88.00);

select is(
  (select count(*) from app.assessment_attempts
    where assessment_attempts.student_id = '53000000-0000-4000-8000-000000000001'),
  2::bigint,
  'A later attempt does not overwrite an earlier one'
);

select is(
  (select overall_score from app.assessment_attempts
    where assessment_attempts.attempt_id = '11110000-0000-4000-8000-000000000001'),
  62.50::numeric,
  'The earlier attempt keeps its own score'
);

-- ---------------------------------------------------------------------------
-- Attempt state transitions
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.assessment_attempts (assessment_id, student_id, status, submitted_at)
     values ('f3000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002',
             'in_progress', now()) $$,
  '23514', null::text,
  'An attempt in progress cannot already have a submission time'
);

select throws_ok(
  $$ insert into app.assessment_attempts (assessment_id, student_id, status, overall_score)
     values ('f3000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002',
             'in_progress', 50) $$,
  '23514', null::text,
  'An attempt in progress cannot already carry a score'
);

select throws_ok(
  $$ insert into app.assessment_attempts (assessment_id, student_id, status)
     values ('f3000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002',
             'submitted') $$,
  '23514', null::text,
  'A submitted attempt must record when it was submitted'
);

select throws_ok(
  $$ insert into app.assessment_attempts (assessment_id, student_id, status, submitted_at)
     values ('f3000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002',
             'scored', now()) $$,
  '23514', null::text,
  'A scored attempt must carry a score'
);

select throws_ok(
  $$ insert into app.assessment_attempts (assessment_id, student_id, status, started_at, submitted_at, overall_score)
     values ('f3000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002',
             'scored', now(), now() - interval '1 hour', 50) $$,
  '23514', null::text,
  'An attempt cannot be submitted before it was started'
);

select throws_ok(
  $$ insert into app.assessment_attempts (assessment_id, student_id, status, submitted_at, overall_score)
     values ('f3000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002',
             'scored', now(), 101) $$,
  '23514', null::text,
  'An attempt score above one hundred percent is rejected'
);

select throws_ok(
  $$ insert into app.assessment_attempts (assessment_id, student_id)
     values ('f3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000dead') $$,
  '23503', null::text,
  'An attempt must belong to a real learner'
);

-- ---------------------------------------------------------------------------
-- Responses
-- ---------------------------------------------------------------------------
insert into app.assessment_responses (attempt_id, question_id, answer, is_correct) values
  ('11110000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', '{"choice":"1"}'::jsonb, true),
  ('11110000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000002', '{"value":4}'::jsonb, false);

select is(
  (select count(*) from app.assessment_responses
    where assessment_responses.attempt_id = '11110000-0000-4000-8000-000000000001'),
  2::bigint,
  'An attempt records one response per answered question'
);

select throws_ok(
  $$ insert into app.assessment_responses (attempt_id, question_id, answer)
     values ('11110000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001',
             '{"choice":"2"}'::jsonb) $$,
  '23505', null::text,
  'An attempt cannot hold two responses to the same question'
);

-- The same question may of course be answered again in a different attempt.
insert into app.assessment_responses (attempt_id, question_id, answer, is_correct) values
  ('11110000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000001', '{"choice":"1"}'::jsonb, true);

select is(
  (select count(*) from app.assessment_responses
    where assessment_responses.question_id = 'e3000000-0000-4000-8000-000000000001'),
  2::bigint,
  'The same question can be answered again in a later attempt'
);

-- ---------------------------------------------------------------------------
-- Competency results are constrained to their own evidence
-- ---------------------------------------------------------------------------
insert into app.competency_results
  (attempt_id, competency_id, raw_score, max_score, percentage, mastery_band)
values
  ('11110000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
   4, 10, 40.00, 'Needs Improvement');

select is(
  (select mastery_band from app.competency_results
    where competency_results.attempt_id = '11110000-0000-4000-8000-000000000001'
      and competency_results.competency_id = 'c3000000-0000-4000-8000-000000000001'),
  'Needs Improvement'::app.mastery_band,
  'An attempt produces a deterministic per-competency result'
);

select throws_ok(
  $$ insert into app.competency_results (attempt_id, competency_id, raw_score, max_score, percentage, mastery_band)
     values ('11110000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
             5, 10, 50.00, 'Developing') $$,
  '23505', null::text,
  'An attempt cannot hold two results for the same competency'
);

select throws_ok(
  $$ insert into app.competency_results (attempt_id, competency_id, raw_score, max_score, percentage, mastery_band)
     values ('11110000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001',
             9, 10, 40.00, 'Needs Improvement') $$,
  '23514', null::text,
  'A percentage that disagrees with its raw and max score is rejected'
);

select throws_ok(
  $$ insert into app.competency_results (attempt_id, competency_id, raw_score, max_score, percentage, mastery_band)
     values ('11110000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001',
             9, 10, 90.00, 'Needs Improvement') $$,
  '23514', null::text,
  'A mastery band that disagrees with its own percentage is rejected'
);

select throws_ok(
  $$ insert into app.competency_results (attempt_id, competency_id, raw_score, max_score, percentage, mastery_band)
     values ('11110000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001',
             11, 10, 110.00, 'Mastered') $$,
  '23514', null::text,
  'A raw score above the maximum is rejected'
);

select throws_ok(
  $$ insert into app.competency_results (attempt_id, competency_id, raw_score, max_score, percentage, mastery_band)
     values ('11110000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001',
             0, 0, 0, 'Needs Improvement') $$,
  '23514', null::text,
  'A result with no possible marks is rejected'
);

-- A correctly derived Mastered result is accepted.
insert into app.competency_results
  (attempt_id, competency_id, raw_score, max_score, percentage, mastery_band)
values
  ('11110000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001',
   9, 10, 90.00, 'Mastered');

select is(
  (select mastery_band from app.competency_results
    where competency_results.attempt_id = '11110000-0000-4000-8000-000000000002'),
  'Mastered'::app.mastery_band,
  'A ninety percent result is Mastered'
);

-- ---------------------------------------------------------------------------
-- Learning path
-- ---------------------------------------------------------------------------
insert into app.learning_path_items (student_id, competency_id, module_id, priority, reason, status) values
  ('53000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
   'd3000000-0000-4000-8000-000000000001', 1, 'Diagnostic gap', 'available'),
  ('53000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002',
   'd3000000-0000-4000-8000-000000000002', 2, 'Diagnostic gap', 'locked');

select is(
  (select string_agg(competencies.code, ',' order by learning_path_items.priority)
   from app.learning_path_items
   join app.competencies on competencies.competency_id = learning_path_items.competency_id
   where learning_path_items.student_id = '53000000-0000-4000-8000-000000000001'),
  'REC-COMP-1,REC-COMP-2',
  'A learner has an ordered personalised path'
);

select throws_ok(
  $$ insert into app.learning_path_items (student_id, competency_id, module_id, priority)
     values ('53000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
             'd3000000-0000-4000-8000-000000000001', 3) $$,
  '23505', null::text,
  'A learner cannot be recommended the same competency twice'
);

select throws_ok(
  $$ insert into app.learning_path_items (student_id, competency_id, module_id, priority)
     values ('53000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001',
             'd3000000-0000-4000-8000-000000000001', 0) $$,
  '23514', null::text,
  'A learning path position below one is rejected'
);

-- Two learners may hold the same priority as each other.
insert into app.learning_path_items (student_id, competency_id, module_id, priority) values
  ('53000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001',
   'd3000000-0000-4000-8000-000000000001', 1);

select is(
  (select count(*) from app.learning_path_items
    where learning_path_items.priority = 1
      and learning_path_items.student_id in ('53000000-0000-4000-8000-000000000001',
                                             '53000000-0000-4000-8000-000000000002')),
  2::bigint,
  'Two learners each have their own first path item'
);

select throws_ok(
  $$ insert into app.learning_path_items (student_id, competency_id, module_id, priority)
     values ('53000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002',
             'd3000000-0000-4000-8000-000000000002', 1) $$,
  '23505', null::text,
  'One learner cannot hold two path items at the same position'
);

-- ---------------------------------------------------------------------------
-- Module progress
-- ---------------------------------------------------------------------------
insert into app.student_module_progress
  (student_id, module_id, completion_percentage, is_complete, started_at)
values
  ('53000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 40.00, false, now());

select is(
  (select completion_percentage from app.student_module_progress
    where student_module_progress.student_id = '53000000-0000-4000-8000-000000000001'
      and student_module_progress.module_id = 'd3000000-0000-4000-8000-000000000001'),
  40.00::numeric,
  'Module completion is tracked as a percentage'
);

select throws_ok(
  $$ insert into app.student_module_progress (student_id, module_id, completion_percentage)
     values ('53000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 10) $$,
  '23505', null::text,
  'A learner has one progress row per module'
);

select throws_ok(
  $$ insert into app.student_module_progress
       (student_id, module_id, completion_percentage, is_complete, completed_at)
     values ('53000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000001',
             50, true, now()) $$,
  '23514', null::text,
  'A module cannot be complete at less than one hundred percent'
);

select throws_ok(
  $$ insert into app.student_module_progress
       (student_id, module_id, completion_percentage, is_complete)
     values ('53000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000001', 100, true) $$,
  '23514', null::text,
  'A completed module must record when it was completed'
);

select throws_ok(
  $$ insert into app.student_module_progress
       (student_id, module_id, completion_percentage, is_complete)
     values ('53000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000001', 100, false) $$,
  '23514', null::text,
  'A module at one hundred percent cannot still be incomplete'
);

select throws_ok(
  $$ insert into app.student_module_progress
       (student_id, module_id, completion_percentage, is_complete, started_at, completed_at)
     values ('53000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000001',
             100, true, now(), now() - interval '1 hour') $$,
  '23514', null::text,
  'A module cannot be completed before it was started'
);

-- Completing it properly is accepted.
update app.student_module_progress
set completion_percentage = 100, is_complete = true, completed_at = now()
where student_module_progress.student_id = '53000000-0000-4000-8000-000000000001'
  and student_module_progress.module_id = 'd3000000-0000-4000-8000-000000000001';

select ok(
  (select is_complete from app.student_module_progress
    where student_module_progress.student_id = '53000000-0000-4000-8000-000000000001'
      and student_module_progress.module_id = 'd3000000-0000-4000-8000-000000000001'),
  'A module can be marked complete once it reaches one hundred percent'
);

-- ---------------------------------------------------------------------------
-- Activity attempts
-- ---------------------------------------------------------------------------
insert into app.activity_attempts
  (student_id, activity_id, attempt_number, score_percentage, time_spent_seconds, passed, mastery_status)
values
  ('53000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001',
   1, 60.00, 300, false, 'Developing'),
  ('53000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001',
   2, 80.00, 240, true, 'Developing');

select is(
  (select count(*) from app.activity_attempts
    where activity_attempts.student_id = '53000000-0000-4000-8000-000000000001'
      and activity_attempts.activity_id = 'a3000000-0000-4000-8000-000000000001'),
  2::bigint,
  'Activity attempts are retained, not overwritten'
);

select is(
  (select score_percentage from app.activity_attempts
    where activity_attempts.student_id = '53000000-0000-4000-8000-000000000001'
      and activity_attempts.activity_id = 'a3000000-0000-4000-8000-000000000001'
      and activity_attempts.attempt_number = 1),
  60.00::numeric,
  'The first activity attempt keeps its own score'
);

-- Passing an activity does not by itself move the display band.
select is(
  (select mastery_status from app.activity_attempts
    where activity_attempts.student_id = '53000000-0000-4000-8000-000000000001'
      and activity_attempts.attempt_number = 2),
  'Developing'::app.mastery_band,
  'Passing an activity does not by itself raise the display band'
);

select throws_ok(
  $$ insert into app.activity_attempts
       (student_id, activity_id, attempt_number, score_percentage, passed, mastery_status)
     values ('53000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001',
             2, 90, true, 'Mastered') $$,
  '23505', null::text,
  'An activity attempt number cannot be reused for the same learner and activity'
);

select throws_ok(
  $$ insert into app.activity_attempts
       (student_id, activity_id, attempt_number, score_percentage, passed, mastery_status)
     values ('53000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001',
             0, 90, true, 'Mastered') $$,
  '23514', null::text,
  'An activity attempt number below one is rejected'
);

select throws_ok(
  $$ insert into app.activity_attempts
       (student_id, activity_id, attempt_number, score_percentage, passed, mastery_status)
     values ('53000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001',
             1, 101, true, 'Mastered') $$,
  '23514', null::text,
  'An activity score above one hundred percent is rejected'
);

select throws_ok(
  $$ insert into app.activity_attempts
       (student_id, activity_id, attempt_number, score_percentage, time_spent_seconds, passed, mastery_status)
     values ('53000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001',
             1, 90, -1, true, 'Mastered') $$,
  '23514', null::text,
  'Negative time on task is rejected'
);

select throws_ok(
  $$ insert into app.activity_attempts
       (student_id, activity_id, attempt_number, score_percentage, time_spent_seconds, passed, mastery_status)
     values ('53000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001',
             1, 90, 86401, true, 'Mastered') $$,
  '23514', null::text,
  'More than a day on one activity attempt is rejected'
);

-- ---------------------------------------------------------------------------
-- Competency progress
-- ---------------------------------------------------------------------------
insert into app.competency_progress
  (student_id, competency_id, diagnostic_score, current_score, mastery_band,
   attempt_count, unsuccessful_attempts, last_studied_at)
values
  ('53000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
   40.00, 90.00, 'Mastered', 3, 1, now());

select is(
  (select mastery_band from app.competency_progress
    where competency_progress.student_id = '53000000-0000-4000-8000-000000000001'
      and competency_progress.competency_id = 'c3000000-0000-4000-8000-000000000001'),
  'Mastered'::app.mastery_band,
  'Current competency progress carries the band its current score implies'
);

select is(
  (select diagnostic_score from app.competency_progress
    where competency_progress.student_id = '53000000-0000-4000-8000-000000000001'
      and competency_progress.competency_id = 'c3000000-0000-4000-8000-000000000001'),
  40.00::numeric,
  'The diagnostic baseline is retained alongside the current score'
);

select throws_ok(
  $$ insert into app.competency_progress (student_id, competency_id, current_score, mastery_band)
     values ('53000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 50, 'Developing') $$,
  '23505', null::text,
  'A learner has one progress row per competency'
);

select throws_ok(
  $$ insert into app.competency_progress (student_id, competency_id, current_score, mastery_band)
     values ('53000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001', 40, 'Mastered') $$,
  '23514', null::text,
  'A mastery band that disagrees with the current score is rejected'
);

select throws_ok(
  $$ insert into app.competency_progress (student_id, competency_id, current_score)
     values ('53000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001', 40) $$,
  '23514', null::text,
  'A current score without its band is rejected'
);

select throws_ok(
  $$ insert into app.competency_progress (student_id, competency_id, mastery_band)
     values ('53000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001', 'Mastered') $$,
  '23514', null::text,
  'A band without a current score is rejected'
);

select throws_ok(
  $$ insert into app.competency_progress
       (student_id, competency_id, attempt_count, unsuccessful_attempts)
     values ('53000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001', 2, 3) $$,
  '23514', null::text,
  'More unsuccessful attempts than attempts is rejected'
);

select throws_ok(
  $$ insert into app.competency_progress (student_id, competency_id, current_score, mastery_band)
     values ('53000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001', 101, 'Mastered') $$,
  '23514', null::text,
  'A current score above one hundred percent is rejected'
);

-- A learner with no evidence yet is valid, with no score and no band.
insert into app.competency_progress (student_id, competency_id) values
  ('53000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000002');

select ok(
  (select mastery_band is null from app.competency_progress
    where competency_progress.student_id = '53000000-0000-4000-8000-000000000002'
      and competency_progress.competency_id = 'c3000000-0000-4000-8000-000000000002'),
  'A learner with no evidence yet has no band'
);

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ delete from app.student_profiles
     where student_profiles.student_id = '53000000-0000-4000-8000-000000000001' $$,
  '23503', null::text,
  'A learner with recorded evidence cannot be deleted out from under it'
);

select throws_ok(
  $$ delete from app.assessments
     where assessments.assessment_id = 'f3000000-0000-4000-8000-000000000001' $$,
  '23503', null::text,
  'An assessment with recorded attempts cannot be deleted'
);

-- Removing an attempt removes its own responses and results, and nothing else.
delete from app.assessment_attempts
where assessment_attempts.attempt_id = '11110000-0000-4000-8000-000000000002';

select is(
  (select count(*) from app.assessment_responses
    where assessment_responses.attempt_id = '11110000-0000-4000-8000-000000000002'),
  0::bigint,
  'Removing an attempt removes its responses'
);

select is(
  (select count(*) from app.competency_results
    where competency_results.attempt_id = '11110000-0000-4000-8000-000000000002'),
  0::bigint,
  'Removing an attempt removes its competency results'
);

select is(
  (select count(*) from app.assessment_responses
    where assessment_responses.attempt_id = '11110000-0000-4000-8000-000000000001'),
  2::bigint,
  'Removing one attempt leaves another attempt''s evidence intact'
);

select * from finish();

rollback;
