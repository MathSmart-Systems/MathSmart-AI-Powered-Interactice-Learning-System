-- MathSmart Phase 5 — user administration and the diagnostic reset.
--
-- `authenticated` may update its own display fields and nothing else, so an
-- account cannot promote or unsuspend itself. These tests prove the column
-- grant is still that narrow, that suspension is refused for the caller's own
-- account, and that a diagnostic reset voids, re-authorises and audits in one
-- transaction rather than leaving a learner half reset.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- The grants that were deliberately not given
-- ---------------------------------------------------------------------------
select ok(
  not has_column_privilege('authenticated', 'app.user_profiles', 'account_status', 'update'),
  'authenticated cannot update account_status directly'
);
select ok(
  not has_column_privilege('authenticated', 'app.user_profiles', 'role', 'update'),
  'authenticated cannot update role directly'
);
select ok(
  has_column_privilege('authenticated', 'app.user_profiles', 'full_name', 'update'),
  'authenticated can still update its own display name'
);
select ok(
  not has_table_privilege('authenticated', 'app.assessment_attempts', 'update'),
  'authenticated cannot void an attempt directly'
);

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('ad000000-0000-4000-8000-0000000000a1', 'admin.adviser@mathsmart.test'),
  ('bd000000-0000-4000-8000-0000000000b1', 'admin.learner@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('ad000000-0000-4000-8000-0000000000a1', 'Admin Adviser',
   'admin.adviser@mathsmart.test', 'teacher_admin'),
  ('bd000000-0000-4000-8000-0000000000b1', 'Admin Learner',
   'admin.learner@mathsmart.test', 'student');

insert into app.teacher_admin_profiles
  (teacher_admin_id, user_id, employee_id, school_name, division_name)
values
  ('4d000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-0000000000a1',
   'EMP-D001', 'Sample School', 'Sample Division');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('5d000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-0000000000b1',
   'LRN-D00001', (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('cd000000-0000-4000-8000-000000000001', 'ADMIN-COMP-1',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Admin competency', 'published');

insert into app.questions
  (question_id, competency_id, question_type, prompt, choices, answer_key, status)
values
  ('ed000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001',
   'number_input', 'What is 2 + 2?', '[]'::jsonb, '4'::jsonb, 'published');

insert into app.assessments
  (assessment_id, grade_id, title, assessment_type, status, duration_minutes)
values (
  'fd000000-0000-4000-8000-000000000001',
  (select grade_id from app.grade_levels where level = 6),
  'Admin diagnostic', 'diagnostic', 'published', 30
);

insert into app.assessment_questions (assessment_id, question_id, position) values
  ('fd000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000001', 1);

-- ---------------------------------------------------------------------------
-- A learner administers nothing
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"bd000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select throws_ok(
  $$ select app.set_account_status(
       'ad000000-0000-4000-8000-0000000000a1', 'suspended'::app.account_status) $$,
  '42501',
  'Only a Teacher/Administrator may change an account status',
  'A learner cannot suspend an administrator'
);

-- The learner sits the diagnostic, so there is something to reset.
select is(
  (select started.status
   from app.start_assessment_attempt('fd000000-0000-4000-8000-000000000001') as started),
  'in_progress'::app.attempt_status,
  'The learner starts the diagnostic'
);

select is(
  (select submitted.overall_score
   from app.submit_assessment_attempt(
     (select attempt_id from app.assessment_attempts),
     '[{"question_id": "ed000000-0000-4000-8000-000000000001", "answer": "5"}]'::jsonb
   ) as submitted),
  0.00::numeric(5,2),
  'The learner scores zero'
);

select throws_ok(
  $$ select app.reset_diagnostic('5d000000-0000-4000-8000-000000000001', 'Let me retake it.') $$,
  '42501',
  'Only a Teacher/Administrator may reset a diagnostic',
  'A learner cannot reset their own diagnostic'
);

-- ---------------------------------------------------------------------------
-- The administrator suspends an account
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"ad000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is(
  (select changed.account_status
   from app.set_account_status(
     'bd000000-0000-4000-8000-0000000000b1', 'suspended'::app.account_status) as changed),
  'suspended'::app.account_status,
  'An administrator can suspend a learner'
);

select is(
  (select count(*) from app.audit_events
   where audit_events.action = 'account.status_changed'),
  1::bigint,
  'A status change is audited'
);

select throws_ok(
  $$ select app.set_account_status(
       'ad000000-0000-4000-8000-0000000000a1', 'suspended'::app.account_status) $$,
  '42501',
  'An administrator cannot change their own account status',
  'An administrator cannot lock themselves out'
);

select is(
  (select restored.account_status
   from app.set_account_status(
     'bd000000-0000-4000-8000-0000000000b1', 'active'::app.account_status) as restored),
  'active'::app.account_status,
  'A suspended account can be restored'
);

select is(
  (select archived.archived_at
   from app.set_account_status(
     'bd000000-0000-4000-8000-0000000000b1', 'archived'::app.account_status) as archived
  ) is not null,
  true,
  'Archiving stamps archived_at'
);

select is(
  (select restored.archived_at
   from app.set_account_status(
     'bd000000-0000-4000-8000-0000000000b1', 'active'::app.account_status) as restored),
  null::timestamptz,
  'Restoring clears archived_at'
);

-- ---------------------------------------------------------------------------
-- The diagnostic reset
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select app.reset_diagnostic('5d000000-0000-4000-8000-000000000001', 'no') $$,
  '23514',
  'A diagnostic reset needs a reason',
  'A reset without a real reason is refused'
);

select is(
  (select reset.status
   from app.reset_diagnostic(
     '5d000000-0000-4000-8000-000000000001',
     'The learner was interrupted by a power cut.'
   ) as reset),
  'voided'::app.attempt_status,
  'The latest diagnostic attempt is voided'
);

select is(
  (select assessment_attempts.voided_by from app.assessment_attempts),
  '4d000000-0000-4000-8000-000000000001'::uuid,
  'The void records the educator who did it, resolved from auth.uid()'
);

select is(
  (select student_profiles.diagnostic_status from app.student_profiles
   where student_profiles.student_id = '5d000000-0000-4000-8000-000000000001'),
  'not_started'::app.diagnostic_status,
  'The learner returns to not started'
);

select is(
  (select count(*) from app.reassessment_authorizations
   where reassessment_authorizations.student_id = '5d000000-0000-4000-8000-000000000001'),
  1::bigint,
  'The reset authorises the learner to sit it again'
);

select is(
  (select count(*) from app.audit_events
   where audit_events.action = 'assessment.diagnostic_reset'),
  1::bigint,
  'The reset is audited'
);

select throws_ok(
  $$ select app.reset_diagnostic(
       '5d000000-0000-4000-8000-000000000001', 'Nothing left to reset.') $$,
  'P0002',
  'No diagnostic attempt was found',
  'A learner with no live attempt cannot be reset again'
);

reset role;

select * from finish();
rollback;
