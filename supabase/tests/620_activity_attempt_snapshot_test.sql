-- MathSmart — an activity attempt is graded against the questions it was given.
--
-- Assessments have been snapshot-protected since the attempt question
-- snapshots migration. Activities were not: submission inserted a row for every
-- *current* member of app.activity_questions and graded every row against the
-- *live* answer key, so editing an activity while somebody was sitting it
-- changed their score — silently, and after the fact.
--
-- These tests are about that one property. What the learner was given, and what
-- they are marked on, are the same set, whatever the authoring tables say by
-- the time they press submit.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ---------------------------------------------------------------------------
-- Fixtures, created as the migration owner
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a4000000-0000-4000-8000-0000000000a1', 'snapshot.adviser@mathsmart.test'),
  ('b4000000-0000-4000-8000-0000000000b1', 'snapshot.learner@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('a4000000-0000-4000-8000-0000000000a1', 'Snapshot Adviser',
   'snapshot.adviser@mathsmart.test', 'teacher_admin'),
  ('b4000000-0000-4000-8000-0000000000b1', 'Snapshot Learner',
   'snapshot.learner@mathsmart.test', 'student');

insert into app.teacher_admin_profiles (user_id, employee_id, school_name, division_name)
values ('a4000000-0000-4000-8000-0000000000a1', 'EMP-7401',
        'Sample Central Elementary School', 'Sample Division');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id)
values ('54000000-0000-4000-8000-000000000001',
        'b4000000-0000-4000-8000-0000000000b1', 'LRN-740001',
        (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status)
values ('c4000000-0000-4000-8000-000000000001', 'SNAP-NS-01',
        (select grade_id from app.grade_levels where level = 6),
        'Numbers and Number Sense', 'Adding within twenty', 'published');

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective,
   short_explanation, status, order_index)
values ('44000000-0000-4000-8000-000000000001',
        'c4000000-0000-4000-8000-000000000001', 'Adding within twenty', 10,
        'Add two numbers below twenty.', 'Count on from the larger number.',
        'published', 0);

insert into app.activities
  (activity_id, module_id, title, estimated_minutes, mastery_threshold, status)
values ('f4000000-0000-4000-8000-000000000001',
        '44000000-0000-4000-8000-000000000001', 'Adding practice', 10, 75,
        'published');

insert into app.questions
  (question_id, competency_id, question_type, prompt, answer_key, explanation,
   hint, status)
values
  ('e4000000-0000-4000-8000-000000000001',
   'c4000000-0000-4000-8000-000000000001', 'number_input',
   'What is 5 + 5?', '"10"'::jsonb, 'Add the two numbers.',
   'Count on from five.', 'published'),
  ('e4000000-0000-4000-8000-000000000002',
   'c4000000-0000-4000-8000-000000000001', 'number_input',
   'What is 6 + 6?', '"12"'::jsonb, 'Add the two numbers.',
   'Count on from six.', 'published'),
  -- Added to the activity later, while the attempt is already open.
  ('e4000000-0000-4000-8000-000000000003',
   'c4000000-0000-4000-8000-000000000001', 'number_input',
   'What is 7 + 7?', '"14"'::jsonb, 'Add the two numbers.',
   'Count on from seven.', 'published');

insert into app.activity_questions (activity_id, question_id, position) values
  ('f4000000-0000-4000-8000-000000000001',
   'e4000000-0000-4000-8000-000000000001', 1),
  ('f4000000-0000-4000-8000-000000000001',
   'e4000000-0000-4000-8000-000000000002', 2);

-- ---------------------------------------------------------------------------
-- Starting an attempt freezes the set
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"b4000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select started.question_snapshot_count
   from app.start_activity_attempt('f4000000-0000-4000-8000-000000000001') as started),
  2,
  'Starting the attempt freezes one row per question the activity holds'
);

reset role;

-- Scoped to this file's own learner.
--
-- These assertions read `app.activity_attempts` with no predicate, which is
-- only correct while the table holds exactly one row — true on the database CI
-- resets before each run, and false on a workstation that has a learner in it.
-- The subquery then raises "more than one row returned by a subquery used as
-- an expression" and the file reports an error rather than a result.

select is(
  (select count(*)::integer from app.activity_responses
   where activity_responses.delivered_position is not null
     and activity_responses.attempt_id in (
     select attempt_id from app.activity_attempts
     where activity_attempts.student_id = '54000000-0000-4000-8000-000000000001')
  ),
  2,
  'Each frozen row carries the place the question was delivered in'
);

select is(
  (select array_agg(activity_responses.question_id
                    order by activity_responses.delivered_position)
   from app.activity_responses
   where activity_responses.attempt_id in (
     select attempt_id from app.activity_attempts
     where activity_attempts.student_id = '54000000-0000-4000-8000-000000000001')
  ),
  array['e4000000-0000-4000-8000-000000000001',
        'e4000000-0000-4000-8000-000000000002']::uuid[],
  'The frozen order is the authored order'
);

select is(
  (select activity_responses.grading_answer_key from app.activity_responses
   where activity_responses.question_id = 'e4000000-0000-4000-8000-000000000001'),
  '"10"'::jsonb,
  'The key the attempt will be graded against is copied, not looked up later'
);

select is(
  (select activity_responses.delivered_hint from app.activity_responses
   where activity_responses.question_id = 'e4000000-0000-4000-8000-000000000001'),
  'Count on from five.',
  'The hint is frozen with the question, so it cannot change mid-attempt'
);

select ok(
  (select not app.assessment_payload_has_confidential_key(
            activity_responses.delivered_payload)
   from app.activity_responses
   where activity_responses.question_id = 'e4000000-0000-4000-8000-000000000001'),
  'The delivered payload carries no key, answer, explanation, hint or verdict'
);

-- ---------------------------------------------------------------------------
-- The confidential columns are not readable by the Data API role
-- ---------------------------------------------------------------------------
select ok(
  not has_column_privilege('authenticated', 'app.activity_responses',
                           'grading_answer_key', 'select'),
  'authenticated holds no read on the frozen answer key'
);

select ok(
  not has_column_privilege('authenticated', 'app.activity_responses',
                           'delivered_explanation', 'select'),
  'authenticated holds no read on the frozen explanation'
);

select ok(
  not has_column_privilege('authenticated', 'app.activity_responses',
                           'delivered_hint', 'select'),
  'authenticated holds no read on the frozen hint'
);

select ok(
  not has_column_privilege('authenticated', 'app.activity_responses',
                           'is_correct', 'select'),
  'authenticated holds no read on the verdict, as on assessment responses'
);

select ok(
  has_column_privilege('authenticated', 'app.activity_responses', 'answer', 'select'),
  'A learner can still read back the answers they saved'
);

-- ---------------------------------------------------------------------------
-- Authoring the activity mid-attempt does not reach the attempt
-- ---------------------------------------------------------------------------
-- The teacher adds a third question, archives the second, and corrects the
-- first one's key. None of it may touch an attempt already open.
insert into app.activity_questions (activity_id, question_id, position)
values ('f4000000-0000-4000-8000-000000000001',
        'e4000000-0000-4000-8000-000000000003', 3);

update app.questions set status = 'archived'
where questions.question_id = 'e4000000-0000-4000-8000-000000000002';

update app.questions set answer_key = '"99"'::jsonb
where questions.question_id = 'e4000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from app.activity_responses
   where activity_responses.delivered_position is not null
     and activity_responses.attempt_id in (
     select attempt_id from app.activity_attempts
     where activity_attempts.student_id = '54000000-0000-4000-8000-000000000001')
  ),
  2,
  'A question added to the activity does not join an attempt already open'
);

set local request.jwt.claims = '{"sub":"b4000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select checked.is_correct
   from app.check_activity_answer(
     (select attempt_id from app.activity_attempts
      where activity_attempts.student_id = '54000000-0000-4000-8000-000000000001'),
     'e4000000-0000-4000-8000-000000000001',
     '"10"'::jsonb) as checked),
  true,
  'The answer is judged against the frozen key, not the one edited since'
);

select is(
  app.activity_hint(
    (select attempt_id from app.activity_attempts
      where activity_attempts.student_id = '54000000-0000-4000-8000-000000000001'),
    'e4000000-0000-4000-8000-000000000002'),
  'Count on from six.',
  'A question archived mid-attempt still belongs to the attempt, hint and all'
);

select throws_ok(
  $$ select app.check_activity_answer(
       (select attempt_id from app.activity_attempts
      where activity_attempts.student_id = '54000000-0000-4000-8000-000000000001'),
       'e4000000-0000-4000-8000-000000000003',
       '"14"'::jsonb) $$,
  'P0002',
  'That question is not part of this attempt',
  'A question added after the attempt began is refused rather than graded'
);

-- ---------------------------------------------------------------------------
-- Submission marks exactly the frozen set
-- ---------------------------------------------------------------------------
select is(
  (select submitted.max_score
   from app.submit_activity_attempt(
     (select attempt_id from app.activity_attempts
      where activity_attempts.student_id = '54000000-0000-4000-8000-000000000001'),
     '[{"question_id": "e4000000-0000-4000-8000-000000000002", "answer": "12"}]'::jsonb,
     60) as submitted),
  2,
  'The mark is out of the questions the learner was given, not the ones the activity holds now'
);

reset role;

select is(
  (select activity_attempts.raw_score from app.activity_attempts
   where activity_attempts.student_id = '54000000-0000-4000-8000-000000000001'),
  2,
  'Both frozen questions are marked correct against their own frozen keys'
);

select is(
  (select count(*)::integer from app.activity_responses
   where activity_responses.attempt_id = (select attempt_id from app.activity_attempts
      where activity_attempts.student_id = '54000000-0000-4000-8000-000000000001')),
  2,
  'Submission adds no row for a question the attempt was never given'
);

-- ---------------------------------------------------------------------------
-- An activity a learner cannot reach cannot be started
-- ---------------------------------------------------------------------------
-- `activities_select` requires the module to be published before a learner may
-- see an activity at all. The start function runs as the definer, so it has to
-- say the same thing: checking only the activity's own status is what let a
-- learner open an activity with nothing to deliver and be scored zero for it.
update app.learning_modules set status = 'draft'
where learning_modules.module_id = '44000000-0000-4000-8000-000000000001';

set local request.jwt.claims = '{"sub":"b4000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select throws_ok(
  $$ select app.start_activity_attempt('f4000000-0000-4000-8000-000000000001') $$,
  'P0002',
  'No such published activity',
  'An activity whose module is no longer published cannot be started'
);

reset role;
update app.learning_modules set status = 'published'
where learning_modules.module_id = '44000000-0000-4000-8000-000000000001';

update app.competencies set status = 'draft'
where competencies.competency_id = 'c4000000-0000-4000-8000-000000000001';

set local request.jwt.claims = '{"sub":"b4000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select throws_ok(
  $$ select app.start_activity_attempt('f4000000-0000-4000-8000-000000000001') $$,
  'P0002',
  'No such published activity',
  'An activity whose competency is no longer published cannot be started either'
);

reset role;
update app.competencies set status = 'published'
where competencies.competency_id = 'c4000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- An attempt from before the snapshot existed
-- ---------------------------------------------------------------------------
-- One that holds learner work is refused rather than graded against content
-- that has moved since. The refusal is P0004, which the API answers as a
-- conflict telling the learner to ask their teacher to reset it.
insert into app.activity_attempts
  (attempt_id, student_id, activity_id, attempt_number, activity_version)
values ('14000000-0000-4000-8000-000000000009',
        '54000000-0000-4000-8000-000000000001',
        'f4000000-0000-4000-8000-000000000001', 2, 1);

insert into app.activity_responses (attempt_id, question_id, answer, check_count)
values ('14000000-0000-4000-8000-000000000009',
        'e4000000-0000-4000-8000-000000000001', '"10"'::jsonb, 1);

set local request.jwt.claims = '{"sub":"b4000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select throws_ok(
  $$ select app.start_activity_attempt('f4000000-0000-4000-8000-000000000001') $$,
  'P0004',
  'This attempt has no frozen question set',
  'A pre-snapshot attempt holding learner work is refused, not silently regraded'
);

select throws_ok(
  $$ select app.submit_activity_attempt('14000000-0000-4000-8000-000000000009') $$,
  'P0004',
  'This attempt has no frozen question set',
  'And it cannot be submitted either'
);

reset role;

select * from finish();
rollback;
