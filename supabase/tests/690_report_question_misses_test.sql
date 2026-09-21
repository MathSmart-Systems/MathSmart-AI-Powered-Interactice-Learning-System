-- MathSmart — per-question miss counts for Reports.
--
-- `app.report_question_misses` returns totals per question and nothing per
-- learner, and only to an active Teacher/Administrator.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

select ok(
  not has_function_privilege('anon', 'app.report_question_misses(uuid[], timestamptz, timestamptz, uuid)', 'execute'),
  'anon cannot call it'
);

select set_eq(
  $$select parameter_name::text from information_schema.parameters
     where specific_name like 'report_question_misses%' and parameter_mode = 'OUT'$$,
  array['question_id', 'competency_id', 'learners_answered', 'answered', 'incorrect',
        'common_wrong_answer', 'common_wrong_times'],
  'Its columns are totals per question; none names a learner or an attempt'
);

-- A learner asking gets nothing, whatever cohort they name.
insert into auth.users (id, email) values
  ('be000000-0000-4000-8000-0000000009b1', 'misses.learner@mathsmart.test');
insert into app.user_profiles (user_id, full_name, email, role) values
  ('be000000-0000-4000-8000-0000000009b1', 'Misses Learner', 'misses.learner@mathsmart.test', 'student');

set local request.jwt.claims = '{"sub":"be000000-0000-4000-8000-0000000009b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is_empty(
  $$select * from app.report_question_misses(
      array(select student_id from app.student_profiles), null, null, null)$$,
  'A learner gets no rows'
);

reset role;
select * from finish();
rollback;
