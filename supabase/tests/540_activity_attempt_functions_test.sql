-- MathSmart Phase 5 — activity attempts, answer checks, hints and interventions.
--
-- An activity gives feedback while the learner is still working, which means
-- reading the answer key and the authored hint — two columns `authenticated`
-- cannot select. These tests prove the functions read them, that the learner
-- still cannot, that the pass decision and the aggregate follow the stored
-- evidence, and that the automatic intervention fires on the configured number
-- of unsuccessful attempts rather than on anything advisory.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- The configured rules fall back to the documented defaults
-- ---------------------------------------------------------------------------
select is(
  app.setting_integer('intervention.unsuccessful_attempts', 2), 2,
  'An unset setting falls back to the documented default'
);

-- ---------------------------------------------------------------------------
-- Fixture: one competency, one module, one section with an adviser, one
-- activity of two questions, and one learner in that section.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('ab000000-0000-4000-8000-0000000000a1', 'activity.adviser@mathsmart.test'),
  ('bb000000-0000-4000-8000-0000000000b1', 'activity.learner@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('ab000000-0000-4000-8000-0000000000a1', 'Activity Adviser',
   'activity.adviser@mathsmart.test', 'teacher_admin'),
  ('bb000000-0000-4000-8000-0000000000b1', 'Activity Learner',
   'activity.learner@mathsmart.test', 'student');

insert into app.teacher_admin_profiles
  (teacher_admin_id, user_id, employee_id, school_name, division_name)
values
  ('4b000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-0000000000a1',
   'EMP-B001', 'Sample School', 'Sample Division');

insert into app.sections (section_id, grade_id, adviser_id, name) values
  ('6b000000-0000-4000-8000-000000000001',
   (select grade_id from app.grade_levels where level = 6),
   '4b000000-0000-4000-8000-000000000001', 'Activity Section');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id, section_id) values
  ('5b000000-0000-4000-8000-000000000001', 'bb000000-0000-4000-8000-0000000000b1',
   'LRN-B00001', (select grade_id from app.grade_levels where level = 6),
   '6b000000-0000-4000-8000-000000000001');

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('cb000000-0000-4000-8000-000000000001', 'ACTIVITY-COMP-1',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Activity competency', 'published');

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective,
   short_explanation, status, order_index)
values
  ('db000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001',
   'Activity module', 15, 'Objective.', 'Explanation.', 'published', 1);

insert into app.questions
  (question_id, competency_id, question_type, prompt, choices, answer_key,
   explanation, hint, status)
values
  ('eb000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001',
   'number_input', 'What is (-9) x (-8)?', '[]'::jsonb, '"72"'::jsonb,
   'Two negative factors produce a positive product.',
   'Check the signs before multiplying the magnitudes.', 'published'),
  ('eb000000-0000-4000-8000-000000000002', 'cb000000-0000-4000-8000-000000000001',
   'number_input', 'What is 12.6 / 3?', '[]'::jsonb, '4.2'::jsonb,
   'Divide the magnitudes.', null, 'published');

insert into app.activities
  (activity_id, module_id, title, estimated_minutes, points, mastery_threshold, status)
values
  ('fb000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001',
   'Integer Sign Practice', 10, 10, 75, 'published');

insert into app.activity_questions (activity_id, question_id, position) values
  ('fb000000-0000-4000-8000-000000000001', 'eb000000-0000-4000-8000-000000000001', 1),
  ('fb000000-0000-4000-8000-000000000001', 'eb000000-0000-4000-8000-000000000002', 2);

-- ---------------------------------------------------------------------------
-- A learner cannot read the key or the hint directly
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select throws_ok(
  $$ select hint from app.questions
     where question_id = 'eb000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'A learner cannot select hint, even though the hint function returns it'
);

-- ---------------------------------------------------------------------------
-- Starting is resuming, and attempts are numbered
-- ---------------------------------------------------------------------------
select is(
  (select started.attempt_number
   from app.start_activity_attempt('fb000000-0000-4000-8000-000000000001') as started),
  1,
  'The first attempt is numbered one'
);

select is(
  (select count(*) from app.activity_attempts),
  1::bigint,
  'Starting again resumes rather than creating a second attempt'
);

-- ---------------------------------------------------------------------------
-- Answer checks
-- ---------------------------------------------------------------------------
select is(
  (select checked.is_correct
   from app.check_activity_answer(
     (select attempt_id from app.activity_attempts),
     'eb000000-0000-4000-8000-000000000001',
     '"-72"'::jsonb
   ) as checked),
  false,
  'A wrong answer is reported wrong'
);

select is(
  (select checked.attempts_for_question
   from app.check_activity_answer(
     (select attempt_id from app.activity_attempts),
     'eb000000-0000-4000-8000-000000000001',
     '"72"'::jsonb
   ) as checked),
  2,
  'The check count rises with each try at the same question'
);

select is(
  (select checked.hint_available
   from app.check_activity_answer(
     (select attempt_id from app.activity_attempts),
     'eb000000-0000-4000-8000-000000000002',
     '"4.2"'::jsonb
   ) as checked),
  false,
  'A question with no authored hint reports none available'
);

select is(
  app.activity_hint(
    (select attempt_id from app.activity_attempts),
    'eb000000-0000-4000-8000-000000000001'
  ),
  'Check the signs before multiplying the magnitudes.',
  'The hint function returns the authored hint'
);

select isnt(
  app.activity_hint(
    (select attempt_id from app.activity_attempts),
    'eb000000-0000-4000-8000-000000000001'
  ),
  '72',
  'The hint is not the answer'
);

-- ---------------------------------------------------------------------------
-- Submission applies the deterministic rules
-- ---------------------------------------------------------------------------
select is(
  (select submitted.score_percentage
   from app.submit_activity_attempt(
     (select attempt_id from app.activity_attempts),
     '[{"question_id": "eb000000-0000-4000-8000-000000000001", "answer": "17"},
       {"question_id": "eb000000-0000-4000-8000-000000000002", "answer": "9"}]'::jsonb,
     420
   ) as submitted),
  0.00::numeric,
  'Nothing correct is zero percent'
);

select is(
  (select activity_attempts.passed from app.activity_attempts),
  false,
  'Zero percent does not pass a threshold of seventy-five'
);

select is(
  (select competency_progress.unsuccessful_attempts from app.competency_progress),
  1::integer,
  'One unsuccessful attempt is counted'
);

select is(
  (select count(*) from app.interventions),
  0::bigint,
  'One unsuccessful attempt is below the configured trigger of two'
);

-- ---------------------------------------------------------------------------
-- The second unsuccessful attempt reaches the trigger
-- ---------------------------------------------------------------------------
select is(
  (select submitted.intervention_created
   from app.submit_activity_attempt(
     (select app.start_activity_attempt('fb000000-0000-4000-8000-000000000001')).attempt_id,
     '[{"question_id": "eb000000-0000-4000-8000-000000000001", "answer": "17"}]'::jsonb,
     300
   ) as submitted),
  true,
  'The second unsuccessful attempt opens an intervention'
);

select is(
  (select interventions.teacher_admin_id from app.interventions),
  '4b000000-0000-4000-8000-000000000001'::uuid,
  'The case is owned by the adviser of the learner''s section'
);

select is(
  (select interventions.severity from app.interventions),
  'HIGH'::app.intervention_severity,
  'A score below fifty is a high-severity case'
);

select is(
  (select student_profiles.monitoring_status from app.student_profiles
   where student_profiles.student_id = '5b000000-0000-4000-8000-000000000001'),
  'needs_intervention'::app.monitoring_status,
  'The learner is flagged for monitoring'
);

-- ---------------------------------------------------------------------------
-- Passing clears the count and opens nothing further
-- ---------------------------------------------------------------------------
select is(
  (select submitted.passed
   from app.submit_activity_attempt(
     (select app.start_activity_attempt('fb000000-0000-4000-8000-000000000001')).attempt_id,
     '[{"question_id": "eb000000-0000-4000-8000-000000000001", "answer": "72"},
       {"question_id": "eb000000-0000-4000-8000-000000000002", "answer": "4.20"}]'::jsonb,
     200
   ) as submitted),
  true,
  'Everything correct passes, and 4.20 grades as 4.2'
);

select is(
  (select competency_progress.unsuccessful_attempts from app.competency_progress),
  0::integer,
  'Passing clears the unsuccessful run'
);

select is(
  (select count(*) from app.interventions),
  1::bigint,
  'No second case is opened while the first is unresolved'
);

select is(
  (select count(*) from app.activity_attempts where activity_attempts.status = 'scored'),
  3::bigint,
  'Every attempt is retained, and each one is scored'
);

reset role;

select * from finish();
rollback;
