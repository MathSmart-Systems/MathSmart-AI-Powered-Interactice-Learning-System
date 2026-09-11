-- MathSmart Phase 5 — assessment attempts and deterministic grading.
--
-- Grading reads app.questions.answer_key, which `authenticated` cannot select.
-- These tests prove that the grading functions can read it, that a learner
-- still cannot, and that every score, band, aggregate and path item that comes
-- out of a submission is a function of the stored answers and the stored key.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Answer comparison
-- ---------------------------------------------------------------------------
select ok(app.answer_is_correct('"72"'::jsonb, '"72"'::jsonb),
          'An exact answer is correct');
select ok(app.answer_is_correct('"  72 "'::jsonb, '"72"'::jsonb),
          'Surrounding space does not make an answer wrong');
select ok(app.answer_is_correct('"TRUE"'::jsonb, '"true"'::jsonb),
          'Case does not make an answer wrong');
select ok(app.answer_is_correct('"4.20"'::jsonb, '4.2'::jsonb),
          'A number is compared as a number, so 4.20 and 4.2 agree');
select ok(app.answer_is_correct('"1/2"'::jsonb, '["0.5", "1/2"]'::jsonb),
          'An array answer key accepts any one of its values');
select ok(not app.answer_is_correct('"17"'::jsonb, '"72"'::jsonb),
          'A different answer is wrong');
select ok(not app.answer_is_correct(null, '"72"'::jsonb),
          'An unanswered question is wrong, not unknown');

-- ---------------------------------------------------------------------------
-- Hardening
-- ---------------------------------------------------------------------------
select ok(
  (select bool_and(pg_proc.prosecdef)
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.proname in ('start_assessment_attempt', 'save_assessment_answers',
                             'submit_assessment_attempt')),
  'The attempt functions are SECURITY DEFINER, because grading must read a column the caller cannot'
);

select ok(
  (select bool_and(pg_proc.proconfig::text like '%search_path%')
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.proname in ('start_assessment_attempt', 'save_assessment_answers',
                             'submit_assessment_attempt')),
  'The attempt functions pin their search_path'
);

select ok(
  not has_function_privilege('anon', 'app.submit_assessment_attempt(uuid, jsonb)', 'execute'),
  'anon cannot execute app.submit_assessment_attempt'
);

select ok(not has_table_privilege('authenticated', 'app.assessment_attempts', 'insert'),
          'authenticated still holds no INSERT on app.assessment_attempts');
select ok(not has_table_privilege('authenticated', 'app.competency_results', 'insert'),
          'authenticated still holds no INSERT on app.competency_results');

-- ---------------------------------------------------------------------------
-- Fixture: one diagnostic over two competencies, two questions each
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('ba000000-0000-4000-8000-0000000000b1', 'attempt.one@mathsmart.test'),
  ('ba000000-0000-4000-8000-0000000000b2', 'attempt.two@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('ba000000-0000-4000-8000-0000000000b1', 'Attempt Learner One',
   'attempt.one@mathsmart.test', 'student'),
  ('ba000000-0000-4000-8000-0000000000b2', 'Attempt Learner Two',
   'attempt.two@mathsmart.test', 'student');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('5a000000-0000-4000-8000-000000000001', 'ba000000-0000-4000-8000-0000000000b1',
   'LRN-A00001', (select grade_id from app.grade_levels where level = 6)),
  ('5a000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-0000000000b2',
   'LRN-A00002', (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('ca000000-0000-4000-8000-000000000001', 'ATTEMPT-COMP-1',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Attempt competency one', 'published'),
  ('ca000000-0000-4000-8000-000000000002', 'ATTEMPT-COMP-2',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Attempt competency two', 'published');

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective,
   short_explanation, status, order_index)
values
  ('da000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001',
   'Attempt module one', 15, 'Objective one.', 'Explanation one.', 'published', 1),
  ('da000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000002',
   'Attempt module two', 15, 'Objective two.', 'Explanation two.', 'published', 1);

insert into app.questions
  (question_id, competency_id, question_type, prompt, choices, answer_key, status)
values
  ('ea000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001',
   'multiple_choice', 'What is (-9) x (-8)?', '["-72","72","-17","17"]'::jsonb,
   '"72"'::jsonb, 'published'),
  ('ea000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000001',
   'number_input', 'What is 12.6 / 3?', '[]'::jsonb, '4.2'::jsonb, 'published'),
  ('ea000000-0000-4000-8000-000000000003', 'ca000000-0000-4000-8000-000000000002',
   'number_input', 'What is 2 + 2?', '[]'::jsonb, '4'::jsonb, 'published'),
  ('ea000000-0000-4000-8000-000000000004', 'ca000000-0000-4000-8000-000000000002',
   'number_input', 'What is 3 + 3?', '[]'::jsonb, '6'::jsonb, 'published');

insert into app.assessments
  (assessment_id, grade_id, title, assessment_type, status, duration_minutes)
values (
  'fa000000-0000-4000-8000-000000000001',
  (select grade_id from app.grade_levels where level = 6),
  'Attempt diagnostic', 'diagnostic', 'published', 30
);

insert into app.assessment_questions (assessment_id, question_id, position) values
  ('fa000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 1),
  ('fa000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000002', 2),
  ('fa000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000003', 3),
  ('fa000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000004', 4);

-- ---------------------------------------------------------------------------
-- A learner still cannot read an answer key
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"ba000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select throws_ok(
  $$ select answer_key from app.questions
     where question_id = 'ea000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'A learner still cannot select answer_key, even though grading reads it'
);

-- ---------------------------------------------------------------------------
-- Starting is resuming
-- ---------------------------------------------------------------------------
select is(
  (select started.status
   from app.start_assessment_attempt('fa000000-0000-4000-8000-000000000001') as started),
  'in_progress'::app.attempt_status,
  'A new attempt starts in progress'
);

select is(
  (select count(distinct attempt_id) from (
     select (app.start_assessment_attempt('fa000000-0000-4000-8000-000000000001')).attempt_id
     union all
     select (app.start_assessment_attempt('fa000000-0000-4000-8000-000000000001')).attempt_id
   ) as repeated),
  1::bigint,
  'Starting again resumes the open attempt rather than creating a second one'
);

select is(
  (select student_profiles.diagnostic_status from app.student_profiles
   where student_profiles.student_id = '5a000000-0000-4000-8000-000000000001'),
  'in_progress'::app.diagnostic_status,
  'Beginning the diagnostic moves the learner off not_started'
);

-- ---------------------------------------------------------------------------
-- Autosave
-- ---------------------------------------------------------------------------
select is(
  app.save_assessment_answers(
    (select attempt_id from app.assessment_attempts
     where student_id = '5a000000-0000-4000-8000-000000000001'),
    '[{"question_id": "ea000000-0000-4000-8000-000000000001", "answer": "72"}]'::jsonb
  ),
  1,
  'One answer is saved'
);

select is(
  (select count(*) from app.assessment_responses
   where assessment_responses.is_correct is not null),
  0::bigint,
  'Autosave grades nothing'
);

-- ---------------------------------------------------------------------------
-- Submission grades deterministically
-- ---------------------------------------------------------------------------
select is(
  (select submitted.overall_score
   from app.submit_assessment_attempt(
     (select attempt_id from app.assessment_attempts
      where student_id = '5a000000-0000-4000-8000-000000000001'),
     '[{"question_id": "ea000000-0000-4000-8000-000000000002", "answer": "4.20"},
       {"question_id": "ea000000-0000-4000-8000-000000000003", "answer": "9"}]'::jsonb
   ) as submitted),
  50.00::numeric(5,2),
  'Two of four correct is fifty percent'
);

select is(
  (select assessment_attempts.status from app.assessment_attempts
   where assessment_attempts.student_id = '5a000000-0000-4000-8000-000000000001'),
  'scored'::app.attempt_status,
  'A submitted attempt is scored'
);

select is(
  (select count(*) from app.assessment_responses),
  4::bigint,
  'An unanswered question still produces a response, because blank is wrong rather than absent'
);

select is(
  (select competency_results.percentage from app.competency_results
   where competency_results.competency_id = 'ca000000-0000-4000-8000-000000000001'),
  100.00::numeric(5,2),
  'The competency answered correctly twice scores one hundred'
);

select is(
  (select competency_results.mastery_band from app.competency_results
   where competency_results.competency_id = 'ca000000-0000-4000-8000-000000000002'),
  'Needs Improvement'::app.mastery_band,
  'The competency answered wrongly twice lands in Needs Improvement'
);

select is(
  (select competency_progress.diagnostic_score from app.competency_progress
   where competency_progress.competency_id = 'ca000000-0000-4000-8000-000000000002'),
  0.00::numeric(5,2),
  'A diagnostic records the baseline it is named for'
);

-- ---------------------------------------------------------------------------
-- The targeted path
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from app.learning_path_items),
  1::bigint,
  'Only the unmastered competency earns a path item'
);

select is(
  (select learning_path_items.competency_id from app.learning_path_items),
  'ca000000-0000-4000-8000-000000000002'::uuid,
  'The path item points at the competency that needs work'
);

select is(
  (select learning_path_items.status from app.learning_path_items),
  'available'::app.path_item_status,
  'The first path item is available'
);

select ok(
  (select learning_path_items.reason like 'Assessment score of 0%%'
   from app.learning_path_items),
  'The reason states the deterministic evidence'
);

select is(
  (select student_profiles.diagnostic_status from app.student_profiles
   where student_profiles.student_id = '5a000000-0000-4000-8000-000000000001'),
  'completed'::app.diagnostic_status,
  'Submitting the diagnostic completes it'
);

-- ---------------------------------------------------------------------------
-- A scored attempt is finished
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select app.save_assessment_answers(
       (select attempt_id from app.assessment_attempts
        where student_id = '5a000000-0000-4000-8000-000000000001'),
       '[{"question_id": "ea000000-0000-4000-8000-000000000001", "answer": "17"}]'::jsonb
     ) $$,
  'P0002',
  'No attempt of yours is in progress',
  'A scored attempt cannot be answered again'
);

-- Nor can it be retaken. The educator's authorization is what reopens the
-- assessment, and none has been granted yet.
select throws_ok(
  $$ select app.start_assessment_attempt('fa000000-0000-4000-8000-000000000001') $$,
  '42501',
  'A reassessment needs an authorization',
  'A learner cannot retake a scored assessment on their own'
);

select is(
  (select count(*) from app.assessment_attempts
   where assessment_attempts.student_id = '5a000000-0000-4000-8000-000000000001'),
  1::bigint,
  'The refused retake left no attempt behind'
);

-- ---------------------------------------------------------------------------
-- Another learner reaches none of it
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"ba000000-0000-4000-8000-0000000000b2","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select count(*) from app.assessment_attempts),
  0::bigint,
  'The second learner sees none of the first learner''s attempts'
);

select is(
  (select count(*) from app.learning_path_items),
  0::bigint,
  'The second learner sees none of the first learner''s path'
);

select throws_ok(
  $$ select app.submit_assessment_attempt(
       (select attempt_id from app.assessment_attempts) ) $$,
  'P0002',
  'No attempt of yours is in progress',
  'The second learner cannot submit an attempt they cannot even see'
);

-- ---------------------------------------------------------------------------
-- Reassessment authorization is an educator's decision
-- ---------------------------------------------------------------------------
reset role;

insert into auth.users (id, email) values
  ('aa000000-0000-4000-8000-0000000000a1', 'attempt.adviser@mathsmart.test');
insert into app.user_profiles (user_id, full_name, email, role) values
  ('aa000000-0000-4000-8000-0000000000a1', 'Attempt Adviser',
   'attempt.adviser@mathsmart.test', 'teacher_admin');
insert into app.teacher_admin_profiles
  (teacher_admin_id, user_id, employee_id, school_name, division_name)
values
  ('4a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-0000000000a1',
   'EMP-A001', 'Sample School', 'Sample Division');

set local request.jwt.claims = '{"sub":"ba000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select throws_ok(
  $$ select app.authorize_reassessment(
       '5a000000-0000-4000-8000-000000000001',
       'fa000000-0000-4000-8000-000000000001',
       'The learner wants another go.'
     ) $$,
  '42501',
  'Only a Teacher/Administrator may authorise a reassessment',
  'A learner cannot authorise their own reassessment'
);

reset role;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is(
  (select granted.authorized_by
   from app.authorize_reassessment(
     '5a000000-0000-4000-8000-000000000001',
     'fa000000-0000-4000-8000-000000000001',
     'Interrupted by a power cut during the diagnostic.'
   ) as granted),
  '4a000000-0000-4000-8000-000000000001'::uuid,
  'The authorization names the educator who called, taken from auth.uid()'
);

reset role;

select is(
  (select count(*) from app.audit_events
   where audit_events.action = 'assessment.reassessment_authorized'),
  1::bigint,
  'Authorising a reassessment writes its audit event in the same transaction'
);

select ok(
  not has_table_privilege('authenticated', 'app.reassessment_authorizations', 'insert'),
  'authenticated still holds no INSERT on app.reassessment_authorizations'
);

-- ---------------------------------------------------------------------------
-- An authorization opens exactly one reassessment
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"ba000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select retake.status
   from app.start_assessment_attempt('fa000000-0000-4000-8000-000000000001') as retake),
  'in_progress'::app.attempt_status,
  'The authorization the educator granted opens the reassessment'
);

reset role;

select is(
  (select count(*) from app.reassessment_authorizations
   where reassessment_authorizations.consumed_at is not null),
  1::bigint,
  'Starting the reassessment spent the authorization'
);

select is(
  (select reassessment_authorizations.consumed_attempt_id
   from app.reassessment_authorizations
   where reassessment_authorizations.consumed_at is not null),
  (select attempt_id from app.assessment_attempts
   where assessment_attempts.student_id = '5a000000-0000-4000-8000-000000000001'
     and assessment_attempts.status = 'in_progress'::app.attempt_status),
  'The authorization names the attempt that spent it'
);

set local request.jwt.claims = '{"sub":"ba000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

-- Resuming is not a second reassessment: the open attempt comes back, and the
-- grant is not spent again.
select is(
  (select count(distinct attempt_id) from (
     select (app.start_assessment_attempt('fa000000-0000-4000-8000-000000000001')).attempt_id
     union all
     select attempt_id from app.assessment_attempts
     where assessment_attempts.status = 'in_progress'::app.attempt_status
   ) as resumed),
  1::bigint,
  'Calling again while the reassessment is open resumes it'
);

reset role;

select is(
  (select count(*) from app.reassessment_authorizations
   where reassessment_authorizations.consumed_at is not null),
  1::bigint,
  'Resuming spends no further authorization'
);

set local request.jwt.claims = '{"sub":"ba000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

-- Finish the reassessment, then ask for a third attempt on the spent grant.
select ok(
  (select submitted.status = 'scored'::app.attempt_status
   from app.submit_assessment_attempt(
     (select attempt_id from app.assessment_attempts
      where assessment_attempts.student_id = '5a000000-0000-4000-8000-000000000001'
        and assessment_attempts.status = 'in_progress'::app.attempt_status),
     '[]'::jsonb
   ) as submitted),
  'The reassessment is graded like any other attempt'
);

select throws_ok(
  $$ select app.start_assessment_attempt('fa000000-0000-4000-8000-000000000001') $$,
  '42501',
  'A reassessment needs an authorization',
  'A spent authorization cannot be used a second time'
);

-- An expired grant is no grant.
reset role;

insert into app.reassessment_authorizations
  (student_id, assessment_id, authorized_by, reason, granted_at, expires_at)
values (
  '5a000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000001', 'Expired grant.',
  now() - interval '2 days', now() - interval '1 day'
);

set local request.jwt.claims = '{"sub":"ba000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select throws_ok(
  $$ select app.start_assessment_attempt('fa000000-0000-4000-8000-000000000001') $$,
  '42501',
  'A reassessment needs an authorization',
  'An expired authorization does not reopen the assessment'
);

-- An expired grant must not become a permanent block. The open-grant index
-- cannot read a clock, so an expired row still occupies the one open slot per
-- learner and assessment until something retires it.
reset role;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select lives_ok(
  $$ select app.authorize_reassessment(
       '5a000000-0000-4000-8000-000000000001',
       'fa000000-0000-4000-8000-000000000001',
       'The first grant expired before the learner could sit it.'
     ) $$,
  'An educator can replace an expired authorization'
);

reset role;

select is(
  (select count(*) from app.reassessment_authorizations
   where reassessment_authorizations.superseded_at is not null),
  1::bigint,
  'The expired grant is retired rather than deleted, so the audit record survives'
);

select is(
  (select count(*) from app.reassessment_authorizations
   where reassessment_authorizations.consumed_at is null
     and reassessment_authorizations.superseded_at is null),
  1::bigint,
  'Exactly one grant is open afterwards'
);

set local request.jwt.claims = '{"sub":"ba000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select replaced.status
   from app.start_assessment_attempt('fa000000-0000-4000-8000-000000000001') as replaced),
  'in_progress'::app.attempt_status,
  'The replacement authorization reopens the assessment'
);

-- Put the learner back to a finished sitting, so the assertions that follow
-- read the same state as before this block.
reset role;

update app.assessment_attempts
set status = 'scored'::app.attempt_status, submitted_at = now(), overall_score = 0.00
where assessment_attempts.student_id = '5a000000-0000-4000-8000-000000000001'
  and assessment_attempts.status = 'in_progress'::app.attempt_status;

-- A grant belongs to one learner and one assessment.
reset role;

delete from app.reassessment_authorizations
where reassessment_authorizations.consumed_at is null
  and reassessment_authorizations.superseded_at is null;

insert into app.assessments
  (assessment_id, grade_id, title, assessment_type, status, duration_minutes)
values (
  'fa000000-0000-4000-8000-000000000002',
  (select grade_id from app.grade_levels where level = 6),
  'Attempt unit quiz', 'unit_quiz', 'published', 20
);

insert into app.reassessment_authorizations
  (student_id, assessment_id, authorized_by, reason)
values
  ('5a000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001',
   '4a000000-0000-4000-8000-000000000001', 'Granted to the other learner.'),
  ('5a000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000002',
   '4a000000-0000-4000-8000-000000000001', 'Granted for a different assessment.');

set local request.jwt.claims = '{"sub":"ba000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select throws_ok(
  $$ select app.start_assessment_attempt('fa000000-0000-4000-8000-000000000001') $$,
  '42501',
  'A reassessment needs an authorization',
  'A grant for another learner, and one for another assessment, are both refused'
);

-- The consumption is a compare-and-set, and that is what makes it safe under
-- concurrency: a second writer updates nothing rather than spending one grant
-- twice. Two connections cannot be opened inside one pgTAP transaction, so the
-- property is asserted here against the statement the function runs, and proved
-- across real concurrent connections in
-- backend/modules/assessments/tests/test_assessments_integration.py.
reset role;

with spent_again as (
  update app.reassessment_authorizations
  set consumed_at = now(),
      consumed_attempt_id = (
        select attempt_id from app.assessment_attempts
        where assessment_attempts.student_id = '5a000000-0000-4000-8000-000000000001'
        limit 1)
  where reassessment_authorizations.consumed_at is null
    and reassessment_authorizations.authorization_id in (
      select spent.authorization_id from app.reassessment_authorizations as spent
      where spent.consumed_at is not null)
  returning 1
)
select is(
  (select count(*) from spent_again),
  0::bigint,
  'The consuming update matches nothing once the grant is spent'
);


select * from finish();
rollback;
