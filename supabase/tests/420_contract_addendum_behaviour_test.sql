-- MathSmart Phase 5a — behaviour of the API contract addendum.
--
-- Constraint behaviour first, then access control. The centrepiece is the
-- activity attempt lifecycle: an attempt now exists from the moment a learner
-- starts it, holds no result until it is submitted, and cannot be started twice.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a7000000-0000-4000-8000-0000000000a1', 'addendum.adviser@mathsmart.test'),
  ('b7000000-0000-4000-8000-0000000000b1', 'addendum.learner.one@mathsmart.test'),
  ('b7000000-0000-4000-8000-0000000000b2', 'addendum.learner.two@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('a7000000-0000-4000-8000-0000000000a1', 'Addendum Adviser', 'addendum.adviser@mathsmart.test', 'teacher_admin'),
  ('b7000000-0000-4000-8000-0000000000b1', 'Addendum Learner One', 'addendum.learner.one@mathsmart.test', 'student'),
  ('b7000000-0000-4000-8000-0000000000b2', 'Addendum Learner Two', 'addendum.learner.two@mathsmart.test', 'student');

insert into app.teacher_admin_profiles (teacher_admin_id, user_id, employee_id, school_name, division_name) values
  ('a7000000-0000-4000-8000-0000000000f1', 'a7000000-0000-4000-8000-0000000000a1',
   'EMP-7101', 'Sample Central Elementary School', 'Sample Division');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('57000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-0000000000b1', 'LRN-700101',
   (select grade_id from app.grade_levels where level = 6)),
  ('57000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-0000000000b2', 'LRN-700102',
   (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('c7000000-0000-4000-8000-000000000001', 'ADD-COMP-1',
   (select grade_id from app.grade_levels where level = 6), 'Number Sense', 'Addendum competency', 'published');

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective, short_explanation, status, order_index)
values
  ('d7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
   'Addendum module', 20, 'Objective', 'Explanation', 'published', 1);

insert into app.activities (activity_id, module_id, title, estimated_minutes, mastery_threshold, status) values
  ('a7000000-0000-4000-8000-000000000011', 'd7000000-0000-4000-8000-000000000001',
   'Addendum activity', 15, 75, 'published');

insert into app.questions (question_id, competency_id, question_type, prompt, choices, answer_key, status) values
  ('e7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
   'number_input', 'Addendum prompt', '[]'::jsonb, '{"value":4}'::jsonb, 'published');

insert into app.assessments (assessment_id, grade_id, title, assessment_type, status, duration_minutes) values
  ('f7000000-0000-4000-8000-000000000001',
   (select grade_id from app.grade_levels where level = 6), 'Addendum diagnostic', 'diagnostic', 'published', 45);

-- ---------------------------------------------------------------------------
-- An activity attempt exists before it is submitted
-- ---------------------------------------------------------------------------
insert into app.activity_attempts (attempt_id, student_id, activity_id, attempt_number) values
  ('17000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001',
   'a7000000-0000-4000-8000-000000000011', 1);

select is(
  (select status from app.activity_attempts
    where activity_attempts.attempt_id = '17000000-0000-4000-8000-000000000001'),
  'in_progress'::app.attempt_status,
  'An activity attempt can be started before it is submitted'
);

select ok(
  (select submitted_at is null and score_percentage is null and passed is null and mastery_status is null
     from app.activity_attempts
    where activity_attempts.attempt_id = '17000000-0000-4000-8000-000000000001'),
  'An attempt in progress carries no result yet'
);

select throws_ok(
  $$ insert into app.activity_attempts (student_id, activity_id, attempt_number)
     values ('57000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000011', 2) $$,
  '23505', null::text,
  'A learner resumes an activity attempt rather than starting a second one'
);

select throws_ok(
  $$ insert into app.activity_attempts
       (student_id, activity_id, attempt_number, score_percentage)
     values ('57000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000011', 1, 50) $$,
  '23514', null::text,
  'An activity attempt in progress cannot already carry a score'
);

select throws_ok(
  $$ insert into app.activity_attempts
       (student_id, activity_id, attempt_number, status, submitted_at)
     values ('57000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000011', 1,
             'scored', now()) $$,
  '23514', null::text,
  'A scored activity attempt must carry its result'
);

select throws_ok(
  $$ insert into app.activity_attempts
       (student_id, activity_id, attempt_number, status, submitted_at,
        raw_score, max_score, score_percentage, passed, mastery_status)
     values ('57000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000011', 1,
             'scored', now(), 9, 10, 40.00, true, 'Developing') $$,
  '23514', null::text,
  'An activity accuracy that disagrees with its own raw marks is rejected'
);

-- Answers can be saved and checked while the attempt is open.
insert into app.activity_responses (attempt_id, question_id, answer, is_correct, check_count) values
  ('17000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001',
   '{"value":3}'::jsonb, false, 1);

select is(
  (select check_count from app.activity_responses
    where activity_responses.attempt_id = '17000000-0000-4000-8000-000000000001'),
  1,
  'An activity response records how many times its answer was checked'
);

select throws_ok(
  $$ insert into app.activity_responses (attempt_id, question_id, answer)
     values ('17000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001',
             '{"value":4}'::jsonb) $$,
  '23505', null::text,
  'An activity attempt holds one response per question'
);

-- Submitting completes the lifecycle, with the accuracy derived from the marks.
update app.activity_attempts
set status = 'scored', submitted_at = now(),
    raw_score = 9, max_score = 10, score_percentage = 90.00,
    passed = true, mastery_status = 'Mastered', activity_version = 1
where activity_attempts.attempt_id = '17000000-0000-4000-8000-000000000001';

select is(
  (select score_percentage from app.activity_attempts
    where activity_attempts.attempt_id = '17000000-0000-4000-8000-000000000001'),
  90.00::numeric,
  'A submitted activity attempt carries the accuracy its marks imply'
);

-- With the first attempt finished, a second may begin.
insert into app.activity_attempts (student_id, activity_id, attempt_number) values
  ('57000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000011', 2);

select is(
  (select count(*) from app.activity_attempts
    where activity_attempts.student_id = '57000000-0000-4000-8000-000000000001'),
  2::bigint,
  'A second activity attempt begins without disturbing the first'
);

-- ---------------------------------------------------------------------------
-- Voiding an assessment attempt is accountable
-- ---------------------------------------------------------------------------
insert into app.assessment_attempts
  (attempt_id, assessment_id, student_id, assessment_grade_id_snapshot)
values
  ('18000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001',
   '57000000-0000-4000-8000-000000000001',
   (select grade_id from app.grade_levels where level = 6));

select throws_ok(
  $$ update app.assessment_attempts set status = 'voided'
     where assessment_attempts.attempt_id = '18000000-0000-4000-8000-000000000001' $$,
  '23514', null::text,
  'An attempt cannot be voided without a reason and an actor'
);

update app.assessment_attempts
set status = 'voided', voided_reason = 'Interrupted by a fire drill',
    voided_by = 'a7000000-0000-4000-8000-0000000000f1', voided_at = now()
where assessment_attempts.attempt_id = '18000000-0000-4000-8000-000000000001';

select is(
  (select voided_reason from app.assessment_attempts
    where assessment_attempts.attempt_id = '18000000-0000-4000-8000-000000000001'),
  'Interrupted by a fire drill',
  'A voided attempt records why it was voided and by whom'
);

-- ---------------------------------------------------------------------------
-- Reassessment authorization
-- ---------------------------------------------------------------------------
insert into app.reassessment_authorizations
  (authorization_id, student_id, assessment_id, authorized_by, reason)
values
  ('19000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001',
   'f7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-0000000000f1',
   'Learner completed remediation and is ready to be reassessed');

select is(
  (select count(*) from app.reassessment_authorizations
    where reassessment_authorizations.student_id = '57000000-0000-4000-8000-000000000001'),
  1::bigint,
  'An educator can authorize one reassessment with a recorded reason'
);

select throws_ok(
  $$ insert into app.reassessment_authorizations (student_id, assessment_id, authorized_by, reason)
     values ('57000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001',
             'a7000000-0000-4000-8000-0000000000f1', 'Second grant') $$,
  '23505', null::text,
  'An unspent authorization cannot be stockpiled alongside another'
);

select throws_ok(
  $$ insert into app.reassessment_authorizations (student_id, assessment_id, authorized_by, reason)
     values ('57000000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000001',
             'a7000000-0000-4000-8000-0000000000f1', '  ') $$,
  '23514', null::text,
  'A reassessment authorization requires a real reason'
);

select throws_ok(
  $$ update app.reassessment_authorizations set consumed_at = now()
     where reassessment_authorizations.authorization_id = '19000000-0000-4000-8000-000000000001' $$,
  '23514', null::text,
  'An authorization cannot be marked spent without naming the attempt that spent it'
);

-- Spending it properly frees the learner to be granted another later.
update app.reassessment_authorizations
set consumed_at = now(), consumed_attempt_id = '18000000-0000-4000-8000-000000000001'
where reassessment_authorizations.authorization_id = '19000000-0000-4000-8000-000000000001';

insert into app.reassessment_authorizations (student_id, assessment_id, authorized_by, reason) values
  ('57000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001',
   'a7000000-0000-4000-8000-0000000000f1', 'A later reassessment after further work');

select is(
  (select count(*) from app.reassessment_authorizations
    where reassessment_authorizations.student_id = '57000000-0000-4000-8000-000000000001'),
  2::bigint,
  'A spent authorization does not block a later one'
);

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
insert into app.audit_events (actor_user_id, actor_role, action, target_type, target_id, request_id, details) values
  ('a7000000-0000-4000-8000-0000000000a1', 'teacher_admin', 'student.enrolled', 'student_profile',
   '57000000-0000-4000-8000-000000000001', 'req_01J73YVC74Y1TT1F60DVB0J2QX',
   '{"section_changed": true}'::jsonb);

select is(
  (select action from app.audit_events
    where audit_events.request_id = 'req_01J73YVC74Y1TT1F60DVB0J2QX'),
  'student.enrolled',
  'An audit record captures actor, action, target, timestamp and request id'
);

select throws_ok(
  $$ insert into app.audit_events (action, target_type) values ('NotNamespaced', 'student_profile') $$,
  '23514', null::text,
  'An audit action must be a namespaced lower-case identifier'
);

select throws_ok(
  $$ insert into app.audit_events (action, target_type, details)
     values ('student.enrolled', 'student_profile', '["not an object"]'::jsonb) $$,
  '23514', null::text,
  'Audit details must be a JSON object'
);

select throws_ok(
  $$ insert into app.audit_events (action, target_type, details)
     values ('student.enrolled', 'student_profile', '{"api_key":"redacted"}'::jsonb) $$,
  '23514', null::text,
  'An audit record cannot become the place a credential leaks to'
);

-- ---------------------------------------------------------------------------
-- Replay protection
-- ---------------------------------------------------------------------------
insert into app.idempotency_keys (user_id, endpoint, idempotency_key, request_fingerprint) values
  ('b7000000-0000-4000-8000-0000000000b1', 'POST /assessment-attempts/{id}/submit',
   'idem-0000000000000001', 'sha256:abc');

select throws_ok(
  $$ insert into app.idempotency_keys (user_id, endpoint, idempotency_key, request_fingerprint)
     values ('b7000000-0000-4000-8000-0000000000b1', 'POST /assessment-attempts/{id}/submit',
             'idem-0000000000000001', 'sha256:def') $$,
  '23505', null::text,
  'The same idempotency key cannot be claimed twice for one caller and endpoint'
);

select throws_ok(
  $$ insert into app.idempotency_keys (user_id, endpoint, idempotency_key, request_fingerprint, completed_at)
     values ('b7000000-0000-4000-8000-0000000000b2', 'POST /activity-attempts/{id}/submit',
             'idem-0000000000000002', 'sha256:abc', now()) $$,
  '23514', null::text,
  'A completed idempotency record must carry the response it replays'
);

select throws_ok(
  $$ insert into app.idempotency_keys (user_id, endpoint, idempotency_key, request_fingerprint)
     values ('b7000000-0000-4000-8000-0000000000b2', 'POST /activity-attempts/{id}/submit',
             'short', 'sha256:abc') $$,
  '23514', null::text,
  'A trivially short idempotency key is rejected'
);

-- ---------------------------------------------------------------------------
-- Account state, preferences and module sections
-- ---------------------------------------------------------------------------
select is(
  (select account_status from app.user_profiles
    where user_profiles.user_id = 'b7000000-0000-4000-8000-0000000000b1'),
  'active'::app.account_status,
  'An account starts active'
);

select throws_ok(
  $$ update app.user_profiles set account_status = 'archived'
     where user_profiles.user_id = 'b7000000-0000-4000-8000-0000000000b2' $$,
  '23514', null::text,
  'An archived account must record when it was archived'
);

select throws_ok(
  $$ update app.user_profiles set preferences = '{"access_token":"redacted"}'::jsonb
     where user_profiles.user_id = 'b7000000-0000-4000-8000-0000000000b1' $$,
  '23514', null::text,
  'Display preferences cannot be used to smuggle a token'
);

update app.user_profiles
set preferences = '{"reduced_motion": true, "high_contrast": false, "learning_reminders": true}'::jsonb
where user_profiles.user_id = 'b7000000-0000-4000-8000-0000000000b1';

select is(
  (select preferences -> 'reduced_motion' from app.user_profiles
    where user_profiles.user_id = 'b7000000-0000-4000-8000-0000000000b1'),
  'true'::jsonb,
  'A learner''s display preferences are stored'
);

select is(
  (select diagnostic_status from app.student_profiles
    where student_profiles.student_id = '57000000-0000-4000-8000-000000000001'),
  'not_started'::app.diagnostic_status,
  'A learner starts with no diagnostic taken'
);

insert into app.student_module_progress
  (student_id, module_id, completion_percentage, completed_section_ids, last_section_id, started_at)
values
  ('57000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001',
   50.00, '["objective","concept"]'::jsonb, 'concept', now());

select is(
  (select jsonb_array_length(completed_section_ids) from app.student_module_progress
    where student_module_progress.student_id = '57000000-0000-4000-8000-000000000001'),
  2,
  'Module section progress is recorded'
);

select throws_ok(
  $$ update app.student_module_progress set completed_section_ids = '[1,2]'::jsonb
     where student_module_progress.student_id = '57000000-0000-4000-8000-000000000001' $$,
  '23514', null::text,
  'Completed section identifiers must be strings'
);

-- ---------------------------------------------------------------------------
-- Advisory provenance on interventions
-- ---------------------------------------------------------------------------
insert into app.interventions
  (intervention_id, student_id, teacher_admin_id, competency_id, severity, intervention_type)
values
  ('1a000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001',
   'a7000000-0000-4000-8000-0000000000f1', 'c7000000-0000-4000-8000-000000000001',
   'HIGH', 'Teacher Consultation');

select throws_ok(
  $$ update app.interventions set ai_model = 'some-model', ai_provider = 'groq'
     where interventions.intervention_id = '1a000000-0000-4000-8000-000000000001' $$,
  '23514', null::text,
  'Advisory provenance cannot be recorded without any advisory output to attribute'
);

update app.interventions
set ai_insight = 'Advisory summary', ai_provider = 'groq', ai_model = 'some-model',
    ai_confidence_score = 0.820, ai_generated_at = now()
where interventions.intervention_id = '1a000000-0000-4000-8000-000000000001';

select is(
  (select ai_confidence_score from app.interventions
    where interventions.intervention_id = '1a000000-0000-4000-8000-000000000001'),
  0.820::numeric,
  'Advisory provenance is stored alongside the advice it describes'
);

select throws_ok(
  $$ update app.interventions set ai_confidence_score = 1.5
     where interventions.intervention_id = '1a000000-0000-4000-8000-000000000001' $$,
  '23514', null::text,
  'An advisory confidence outside zero to one is rejected'
);

-- ===========================================================================
-- Access control
-- ===========================================================================
reset role;
set local request.jwt.claims = '';
set local role anon;

select throws_ok($$ select 1 from app.audit_events $$,               '42501', null::text, 'An anonymous caller cannot read the audit trail');
select throws_ok($$ select 1 from app.idempotency_keys $$,           '42501', null::text, 'An anonymous caller cannot read idempotency records');
select throws_ok($$ select 1 from app.activity_responses $$,         '42501', null::text, 'An anonymous caller cannot read activity responses');
select throws_ok($$ select 1 from app.reassessment_authorizations $$,'42501', null::text, 'An anonymous caller cannot read reassessment authorizations');

reset role;
set local request.jwt.claims = '{"sub":"b7000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select count(*) from app.activity_responses
    where activity_responses.attempt_id = '17000000-0000-4000-8000-000000000001'),
  1::bigint,
  'A learner reads their own activity responses');

select is_empty($$ select 1 from app.audit_events $$,
                'A learner reads nothing from the audit trail');

select is_empty($$ select 1 from app.reassessment_authorizations $$,
                'A learner cannot read the pedagogical reason recorded about them');

select throws_ok($$ select 1 from app.idempotency_keys $$,
                 '42501', null::text, 'A learner cannot read stored idempotent responses');

reset role;
set local request.jwt.claims = '{"sub":"b7000000-0000-4000-8000-0000000000b2","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is_empty($$ select 1 from app.activity_responses
                   where activity_responses.attempt_id = '17000000-0000-4000-8000-000000000001' $$,
                'A learner cannot read another learner''s activity responses');

reset role;
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select isnt_empty($$ select 1 from app.audit_events $$,
                  'A teacher_admin reads the audit trail');

select is(
  (select count(*) from app.reassessment_authorizations
    where reassessment_authorizations.student_id = '57000000-0000-4000-8000-000000000001'),
  2::bigint,
  'A teacher_admin reads reassessment authorizations');

select throws_ok(
  $$ insert into app.audit_events (action, target_type) values ('student.enrolled', 'student_profile') $$,
  '42501', null::text,
  'A teacher_admin cannot write an audit record directly; the backend writes them');

select throws_ok($$ select 1 from app.idempotency_keys $$,
                 '42501', null::text, 'A teacher_admin cannot read stored idempotent responses');

reset role;

select * from finish();

rollback;
