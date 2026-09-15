-- MathSmart Phase 6 — hardening the SECURITY DEFINER write functions.
--
-- The Phase 5b restrictive policies answer the account-status question on every
-- ordinary request, and cannot answer it inside a SECURITY DEFINER function,
-- because bypassing Row Level Security is the whole reason those functions are
-- definers. These tests prove the rule is restated where the policies cannot
-- reach: a suspended learner and a suspended Teacher/Administrator are refused
-- by the functions themselves, with the token they already hold.
--
-- The rest of the suite covers the defects found alongside it — a repeated
-- question that aborted a save, a number too large for numeric that aborted
-- grading, a hint asked for against somebody else's question, a lifecycle
-- transition the workflow does not have, a reset that kept the voided baseline,
-- and a unit quiz that wiped a diagnostic's learning path.
--
-- Every assertion here is arranged so that it fails against the code as it was.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- The functions are still definers with a pinned search_path
-- ---------------------------------------------------------------------------
-- Replacing a definer is the easiest way to lose one of these properties by
-- accident, so the invariant is restated after the replacement.
select is(
  (select count(*)
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.proname in (
       'save_module_progress', 'complete_module', 'start_assessment_attempt',
       'save_assessment_answers', 'submit_assessment_attempt',
       'authorize_reassessment', 'start_activity_attempt',
       'check_activity_answer', 'activity_hint', 'submit_activity_attempt',
       'record_audit_event', 'open_intervention', 'update_intervention',
       'archive_intervention', 'set_account_status', 'reset_diagnostic')
     and (not pg_proc.prosecdef or pg_proc.proconfig::text not like '%search_path%')),
  0::bigint,
  'Every hardened function is still SECURITY DEFINER with a pinned search_path'
);

-- ---------------------------------------------------------------------------
-- Grading survives a number no numeric can hold
-- ---------------------------------------------------------------------------
-- "1e1000000" is well-formed, so the cast raises numeric_value_out_of_range
-- rather than invalid_text_representation. Only the latter was caught, so one
-- absurd answer aborted the whole submission instead of grading wrong.
select is(
  app.numeric_of('"1e1000000"'::jsonb),
  null::numeric,
  'A number too large for numeric reads as no number at all'
);

select is(
  app.numeric_of('"4.20"'::jsonb),
  4.20::numeric,
  'An ordinary number still reads as a number, so the handler has not swallowed everything'
);

select ok(
  not app.answer_is_correct('"1e1000000"'::jsonb, '4'::jsonb),
  'An answer too large to hold grades wrong rather than aborting the grading'
);

-- ---------------------------------------------------------------------------
-- The secret-shaped-value check knows the two commonest words it missed
-- ---------------------------------------------------------------------------
select ok(app.looks_like_a_secret('{"credential": "redacted"}'::jsonb),
          'A value carrying a credential is recognised as a secret');
select ok(app.looks_like_a_secret('{"auth_token": "redacted"}'::jsonb),
          'A value carrying an auth token is recognised as a secret');
select ok(not app.looks_like_a_secret('{"mastery_threshold": 75}'::jsonb),
          'An ordinary configuration value is still not a secret');

-- ---------------------------------------------------------------------------
-- Fixture: two competencies with a module each, a diagnostic over both, a unit
-- quiz over the second, an activity on the first, and one learner in a section
-- with an adviser.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('ae000000-0000-4000-8000-0000000000a1', 'harden.adviser@mathsmart.test'),
  ('be000000-0000-4000-8000-0000000000b1', 'harden.learner@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('ae000000-0000-4000-8000-0000000000a1', 'Harden Adviser',
   'harden.adviser@mathsmart.test', 'teacher_admin'),
  ('be000000-0000-4000-8000-0000000000b1', 'Harden Learner',
   'harden.learner@mathsmart.test', 'student');

insert into app.teacher_admin_profiles
  (teacher_admin_id, user_id, employee_id, school_name, division_name)
values
  ('4e000000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-0000000000a1',
   'EMP-E001', 'Sample School', 'Sample Division');

insert into app.sections (section_id, grade_id, adviser_id, name) values
  ('6e000000-0000-4000-8000-000000000001',
   (select grade_id from app.grade_levels where level = 6),
   '4e000000-0000-4000-8000-000000000001', 'Harden Section');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id, section_id) values
  ('5e000000-0000-4000-8000-000000000001', 'be000000-0000-4000-8000-0000000000b1',
   'LRN-E00001', (select grade_id from app.grade_levels where level = 6),
   '6e000000-0000-4000-8000-000000000001');

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('ce000000-0000-4000-8000-000000000001', 'HARDEN-COMP-1',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Harden competency one', 'published'),
  ('ce000000-0000-4000-8000-000000000002', 'HARDEN-COMP-2',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Harden competency two', 'published');

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective,
   short_explanation, status, order_index)
values
  ('de000000-0000-4000-8000-000000000001', 'ce000000-0000-4000-8000-000000000001',
   'Harden module one', 15, 'Objective one.', 'Explanation one.', 'published', 1),
  ('de000000-0000-4000-8000-000000000002', 'ce000000-0000-4000-8000-000000000002',
   'Harden module two', 15, 'Objective two.', 'Explanation two.', 'published', 1);

insert into app.questions
  (question_id, competency_id, question_type, prompt, choices, answer_key,
   explanation, hint, status)
values
  ('ee000000-0000-4000-8000-000000000001', 'ce000000-0000-4000-8000-000000000001',
   'number_input', 'What is (-9) x (-8)?', '[]'::jsonb, '"72"'::jsonb,
   'Two negative factors produce a positive product.', null, 'published'),
  ('ee000000-0000-4000-8000-000000000002', 'ce000000-0000-4000-8000-000000000001',
   'number_input', 'What is 12.6 / 3?', '[]'::jsonb, '4.2'::jsonb,
   'Divide the magnitudes.', null, 'published'),
  ('ee000000-0000-4000-8000-000000000003', 'ce000000-0000-4000-8000-000000000002',
   'number_input', 'What is 2 + 2?', '[]'::jsonb, '4'::jsonb,
   'Add the addends.', null, 'published'),
  ('ee000000-0000-4000-8000-000000000004', 'ce000000-0000-4000-8000-000000000002',
   'number_input', 'What is 3 + 3?', '[]'::jsonb, '6'::jsonb,
   'Add the addends.', null, 'published'),
  ('ee000000-0000-4000-8000-000000000005', 'ce000000-0000-4000-8000-000000000001',
   'number_input', 'What is 5 + 5?', '[]'::jsonb, '10'::jsonb,
   'Add the addends.', 'Count on from five.', 'published'),
  ('ee000000-0000-4000-8000-000000000006', 'ce000000-0000-4000-8000-000000000001',
   'number_input', 'What is 10 + 10?', '[]'::jsonb, '20'::jsonb,
   'Add the addends.', 'Double the ten.', 'published'),
  -- Published, readable, and deliberately in no activity at all.
  ('ee000000-0000-4000-8000-000000000007', 'ce000000-0000-4000-8000-000000000001',
   'number_input', 'What is 7 + 7?', '[]'::jsonb, '14'::jsonb,
   'Add the addends.', 'This hint belongs to another exercise.', 'published');

insert into app.assessments
  (assessment_id, grade_id, title, assessment_type, status, duration_minutes)
values
  ('fe000000-0000-4000-8000-000000000001',
   (select grade_id from app.grade_levels where level = 6),
   'Harden diagnostic', 'diagnostic', 'published', 30),
  ('fe000000-0000-4000-8000-000000000002',
   (select grade_id from app.grade_levels where level = 6),
   'Harden unit quiz', 'unit_quiz', 'published', 15);

insert into app.assessment_questions (assessment_id, question_id, position) values
  ('fe000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001', 1),
  ('fe000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000002', 2),
  ('fe000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000003', 3),
  ('fe000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000004', 4),
  ('fe000000-0000-4000-8000-000000000002', 'ee000000-0000-4000-8000-000000000003', 1);

insert into app.activities
  (activity_id, module_id, title, estimated_minutes, points, mastery_threshold, status)
values
  ('fe000000-0000-4000-8000-000000000003', 'de000000-0000-4000-8000-000000000001',
   'Harden practice', 10, 10, 75, 'published');

insert into app.activity_questions (activity_id, question_id, position) values
  ('fe000000-0000-4000-8000-000000000003', 'ee000000-0000-4000-8000-000000000005', 1),
  ('fe000000-0000-4000-8000-000000000003', 'ee000000-0000-4000-8000-000000000006', 2);

-- ===========================================================================
-- Everything below runs with an active account first, so each refusal later
-- has a control that shows the same call working.
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"be000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select save.completion_percentage
   from app.save_module_progress(
     'de000000-0000-4000-8000-000000000001', array['objective']
   ) as save),
  50.00::numeric(5,2),
  'An active learner saves their own module progress'
);

-- ---------------------------------------------------------------------------
-- The diagnostic builds the learning path
-- ---------------------------------------------------------------------------
select is(
  (select started.status
   from app.start_assessment_attempt('fe000000-0000-4000-8000-000000000001') as started),
  'in_progress'::app.attempt_status,
  'The learner starts the diagnostic'
);

select is(
  (select submitted.overall_score
   from app.submit_assessment_attempt(
     (select attempt_id from app.assessment_attempts
      where assessment_attempts.assessment_id = 'fe000000-0000-4000-8000-000000000001'),
     '[{"question_id": "ee000000-0000-4000-8000-000000000001", "answer": "17"},
       {"question_id": "ee000000-0000-4000-8000-000000000003", "answer": "9"}]'::jsonb
   ) as submitted),
  0.00::numeric(5,2),
  'Nothing correct is zero percent'
);

select is(
  (select count(*) from app.learning_path_items),
  2::bigint,
  'Both unmastered competencies earn a path item'
);

select is(
  (select competency_progress.diagnostic_score from app.competency_progress
   where competency_progress.competency_id = 'ce000000-0000-4000-8000-000000000001'),
  0.00::numeric(5,2),
  'The diagnostic records the baseline it is named for'
);

-- ---------------------------------------------------------------------------
-- A unit quiz grades a repeated question and leaves the path alone
-- ---------------------------------------------------------------------------
-- The payload names the same question twice. Before the fix the ON CONFLICT
-- clause was asked to update one row twice in a single statement, which raises
-- cardinality_violation and lost the whole submission.
select is(
  (select started.assessment_id
   from app.start_assessment_attempt('fe000000-0000-4000-8000-000000000002') as started),
  'fe000000-0000-4000-8000-000000000002'::uuid,
  'The learner starts the unit quiz'
);

select is(
  (select submitted.overall_score
   from app.submit_assessment_attempt(
     (select attempt_id from app.assessment_attempts
      where assessment_attempts.assessment_id = 'fe000000-0000-4000-8000-000000000002'),
     '[{"question_id": "ee000000-0000-4000-8000-000000000003", "answer": "9"},
       {"question_id": "ee000000-0000-4000-8000-000000000003", "answer": "4"}]'::jsonb
   ) as submitted),
  100.00::numeric(5,2),
  'A repeated question does not abort the submission, and the last answer is the one that counts'
);

select is(
  (select count(*) from app.assessment_responses
   where assessment_responses.question_id = 'ee000000-0000-4000-8000-000000000003'
     and assessment_responses.attempt_id = (
       select attempt_id from app.assessment_attempts
       where assessment_attempts.assessment_id = 'fe000000-0000-4000-8000-000000000002')),
  1::bigint,
  'A repeated question still leaves one response row'
);

-- The quiz covers only the second competency and the learner mastered it, so
-- the old rebuild would have deleted both items and put nothing back.
select is(
  (select count(*) from app.learning_path_items),
  2::bigint,
  'A unit quiz leaves the diagnostic''s learning path where it is'
);

select is(
  (select count(*) from app.learning_path_items
   where learning_path_items.competency_id = 'ce000000-0000-4000-8000-000000000001'),
  1::bigint,
  'The item for the competency the quiz never covered survives it'
);

-- ---------------------------------------------------------------------------
-- A hint belongs to the activity being attempted
-- ---------------------------------------------------------------------------
select is(
  (select started.attempt_number
   from app.start_activity_attempt('fe000000-0000-4000-8000-000000000003') as started),
  1,
  'The learner starts the activity'
);

select is(
  app.activity_hint(
    (select attempt_id from app.activity_attempts),
    'ee000000-0000-4000-8000-000000000005'
  ),
  'Count on from five.',
  'A question of this activity yields its authored hint'
);

select throws_ok(
  $$ select app.activity_hint(
       (select attempt_id from app.activity_attempts),
       'ee000000-0000-4000-8000-000000000007') $$,
  'P0002',
  'That question is not part of this activity',
  'A published question outside the activity is refused rather than silently recorded'
);

select throws_ok(
  $$ select app.activity_hint(
       (select attempt_id from app.activity_attempts),
       '00000000-0000-4000-8000-0000000000ff') $$,
  'P0002',
  'That question is not part of this activity',
  'A question that does not exist is refused as a missing one rather than as a foreign key'
);

reset role;

select is(
  (select count(*) from app.activity_responses
   where activity_responses.question_id = 'ee000000-0000-4000-8000-000000000007'),
  0::bigint,
  'The refused hint wrote no response row against the outside question'
);

-- ---------------------------------------------------------------------------
-- An activity submission grades a repeated question too
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"be000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select submitted.score_percentage
   from app.submit_activity_attempt(
     (select attempt_id from app.activity_attempts),
     '[{"question_id": "ee000000-0000-4000-8000-000000000005", "answer": "3"},
       {"question_id": "ee000000-0000-4000-8000-000000000005", "answer": "10"},
       {"question_id": "ee000000-0000-4000-8000-000000000006", "answer": "20"}]'::jsonb,
     120
   ) as submitted),
  100.00::numeric,
  'A repeated question does not abort an activity submission, and the last answer counts'
);

-- ---------------------------------------------------------------------------
-- The intervention lifecycle runs one way
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"ae000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is(
  (select opened.status
   from app.open_intervention(
     '5e000000-0000-4000-8000-000000000001',
     'ce000000-0000-4000-8000-000000000001',
     'MEDIUM', 'Additional Exercise',
     'Booked a short guided session on signed products.'
   ) as opened),
  'In Progress'::app.intervention_status,
  'An active adviser opens a case, which starts In Progress'
);

select throws_ok(
  $$ select app.update_intervention(
       (select intervention_id from app.interventions),
       p_status => 'Needs Intervention'::app.intervention_status
     ) $$,
  '23514',
  'A case that has been taken up cannot return to the queue',
  'An In Progress case cannot be pushed back to the head of the queue'
);

select is(
  (select interventions.status from app.interventions),
  'In Progress'::app.intervention_status,
  'The refused transition left the case where it was'
);

select is(
  (select updated.status
   from app.update_intervention(
     (select intervention_id from app.interventions),
     p_status => 'Resolved'::app.intervention_status
   ) as updated),
  'Resolved'::app.intervention_status,
  'The transition the lifecycle does allow is still accepted'
);

-- ---------------------------------------------------------------------------
-- A reset takes the baseline with it
-- ---------------------------------------------------------------------------
select is(
  (select reset.status
   from app.reset_diagnostic(
     '5e000000-0000-4000-8000-000000000001',
     'The learner was interrupted by a power cut.'
   ) as reset),
  'voided'::app.attempt_status,
  'The latest diagnostic attempt is voided'
);

reset role;

select is(
  (select count(*) from app.competency_progress
   where competency_progress.student_id = '5e000000-0000-4000-8000-000000000001'
     and competency_progress.diagnostic_score is not null),
  0::bigint,
  'The reset clears the baseline the voided sitting recorded'
);

select is(
  (select count(*) from app.competency_progress
   where competency_progress.student_id = '5e000000-0000-4000-8000-000000000001'
     and competency_progress.current_score is not null),
  2::bigint,
  'The reset keeps the current scores, which describe work the learner has done since'
);

-- The retake is the point of the reset: without clearing the baseline first,
-- submit_assessment_attempt keeps the old value and records nothing new.
set local request.jwt.claims = '{"sub":"be000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select retaken.overall_score
   from app.submit_assessment_attempt(
     (select (app.start_assessment_attempt('fe000000-0000-4000-8000-000000000001')).attempt_id),
     '[{"question_id": "ee000000-0000-4000-8000-000000000001", "answer": "72"}]'::jsonb
   ) as retaken),
  25.00::numeric(5,2),
  'The learner retakes the diagnostic and gets one of four right'
);

select is(
  (select competency_progress.diagnostic_score from app.competency_progress
   where competency_progress.competency_id = 'ce000000-0000-4000-8000-000000000001'),
  50.00::numeric(5,2),
  'The retake records a new baseline instead of keeping the voided one'
);

-- ===========================================================================
-- Suspension, with the token the account already holds
-- ===========================================================================
-- Two attempts with identifiers chosen here rather than generated, because a
-- suspended learner can no longer read app.assessment_attempts to find one. The
-- refusals below therefore name a real, open attempt of this learner's, and not
-- a null the functions would have rejected for a different reason.
reset role;

insert into app.assessment_attempts
  (attempt_id, assessment_id, student_id, assessment_version,
   assessment_type_snapshot, assessment_payload,
   question_snapshot_created_at, question_snapshot_count)
values ('1e000000-0000-4000-8000-000000000001',
        'fe000000-0000-4000-8000-000000000002',
        '5e000000-0000-4000-8000-000000000001', 1,
        'unit_quiz', '{"id":"fe000000-0000-4000-8000-000000000002","title":"Harden unit quiz","type":"unit_quiz","duration_minutes":15}'::jsonb,
        now(), 1);

insert into app.assessment_responses
  (attempt_id, question_id, question_version, delivered_position,
   delivered_competency_id, delivered_payload, grading_answer_key)
values
  ('1e000000-0000-4000-8000-000000000001',
   'ee000000-0000-4000-8000-000000000003', 1, 1,
   'ce000000-0000-4000-8000-000000000002',
   '{"id":"ee000000-0000-4000-8000-000000000003","prompt":"What is 2 + 2?","question_type":"number_input","options":[]}'::jsonb,
   '4'::jsonb);

insert into app.activity_attempts
  (attempt_id, student_id, activity_id, attempt_number, activity_version)
values ('1e000000-0000-4000-8000-000000000002',
        '5e000000-0000-4000-8000-000000000001',
        'fe000000-0000-4000-8000-000000000003', 2, 1);

set local request.jwt.claims = '{"sub":"be000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  app.save_assessment_answers(
    '1e000000-0000-4000-8000-000000000001',
    '[{"question_id": "ee000000-0000-4000-8000-000000000003", "answer": "4"}]'::jsonb
  ),
  1,
  'While the account is active the quiz attempt takes an answer, so it really is open and really is theirs'
);

select is(
  (select checked.is_correct
   from app.check_activity_answer(
     '1e000000-0000-4000-8000-000000000002',
     'ee000000-0000-4000-8000-000000000005',
     '"10"'::jsonb
   ) as checked),
  true,
  'While the account is active the activity attempt takes an answer too'
);

reset role;
set local request.jwt.claims = '{"sub":"ae000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is(
  (select changed.account_status
   from app.set_account_status(
     'be000000-0000-4000-8000-0000000000b1', 'suspended'::app.account_status) as changed),
  'suspended'::app.account_status,
  'An active adviser suspends the learner'
);

reset role;
set local request.jwt.claims = '{"sub":"be000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select ok(not app.is_active_account(), 'The suspended learner is not an active account');

select throws_ok(
  $$ select app.save_module_progress(
       'de000000-0000-4000-8000-000000000001', array['objective', 'concept']) $$,
  '42501',
  'Only a learner may save module progress',
  'A suspended learner cannot save module progress'
);

select throws_ok(
  $$ select app.submit_assessment_attempt('1e000000-0000-4000-8000-000000000001') $$,
  '42501',
  'Only a learner may submit an assessment',
  'A suspended learner cannot submit an assessment'
);

select throws_ok(
  $$ select app.submit_activity_attempt('1e000000-0000-4000-8000-000000000002') $$,
  '42501',
  'Only a learner may submit an activity',
  'A suspended learner cannot submit an activity'
);

reset role;

select is(
  (select assessment_attempts.status from app.assessment_attempts
   where assessment_attempts.attempt_id = '1e000000-0000-4000-8000-000000000001'),
  'in_progress'::app.attempt_status,
  'The refused submission left the assessment attempt in progress'
);

select is(
  (select activity_attempts.status from app.activity_attempts
   where activity_attempts.attempt_id = '1e000000-0000-4000-8000-000000000002'),
  'in_progress'::app.attempt_status,
  'The refused submission left the activity attempt in progress'
);

-- ---------------------------------------------------------------------------
-- The same holds for a suspended Teacher/Administrator
-- ---------------------------------------------------------------------------
-- Suspended directly, because the function deliberately refuses to change the
-- caller's own status and there is one adviser here.
update app.user_profiles set account_status = 'suspended'
where user_profiles.user_id = 'ae000000-0000-4000-8000-0000000000a1';

set local request.jwt.claims = '{"sub":"ae000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select ok(app.is_teacher_admin(),
          'The suspended adviser still carries the role claim, which is why the status has to be checked separately');

select throws_ok(
  $$ select app.open_intervention(
       '5e000000-0000-4000-8000-000000000001',
       'ce000000-0000-4000-8000-000000000002',
       'HIGH', 'One-on-One Remediation', 'Opened after suspension.') $$,
  '42501',
  'Only a Teacher/Administrator may record an intervention',
  'A suspended Teacher/Administrator cannot open an intervention'
);

select throws_ok(
  $$ select app.set_account_status(
       'be000000-0000-4000-8000-0000000000b1', 'active'::app.account_status) $$,
  '42501',
  'Only a Teacher/Administrator may change an account status',
  'A suspended Teacher/Administrator cannot restore an account, least of all their own colleague''s'
);

select throws_ok(
  $$ select app.record_audit_event('account.status_changed', 'user_profile') $$,
  '42501',
  'Only a Teacher/Administrator may record an audit event',
  'A suspended Teacher/Administrator cannot write the audit trail'
);

reset role;

select is(
  (select count(*) from app.interventions
   where interventions.competency_id = 'ce000000-0000-4000-8000-000000000002'),
  0::bigint,
  'The refused case was never created'
);

select is(
  (select user_profiles.account_status from app.user_profiles
   where user_profiles.user_id = 'be000000-0000-4000-8000-0000000000b1'),
  'suspended'::app.account_status,
  'The refused restore left the learner suspended'
);

select * from finish();
rollback;
