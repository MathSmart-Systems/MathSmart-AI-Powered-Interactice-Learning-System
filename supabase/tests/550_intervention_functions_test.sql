-- MathSmart Phase 5 — intervention cases and the audit trail.
--
-- A case is an educator's record about a learner and an audit row is evidence,
-- so neither is writable by the caller directly. These tests prove that the
-- functions enforce who may write, that the documented lifecycle is enforced
-- rather than trusted, that reopening needs a reason, and that every mutation
-- leaves an audit row behind.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- The grants that were deliberately not given
-- ---------------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'app.interventions', 'insert'),
          'authenticated holds no INSERT on app.interventions');
select ok(not has_table_privilege('authenticated', 'app.interventions', 'update'),
          'authenticated holds no UPDATE on app.interventions');
select ok(not has_table_privilege('authenticated', 'app.audit_events', 'insert'),
          'authenticated holds no INSERT on app.audit_events');
select ok(not has_function_privilege('anon', 'app.record_audit_event(text, text, uuid, text, jsonb)', 'execute'),
          'anon cannot record an audit event');

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('ac000000-0000-4000-8000-0000000000a1', 'case.adviser@mathsmart.test'),
  ('bc000000-0000-4000-8000-0000000000b1', 'case.learner@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('ac000000-0000-4000-8000-0000000000a1', 'Case Adviser',
   'case.adviser@mathsmart.test', 'teacher_admin'),
  ('bc000000-0000-4000-8000-0000000000b1', 'Case Learner',
   'case.learner@mathsmart.test', 'student');

insert into app.teacher_admin_profiles
  (teacher_admin_id, user_id, employee_id, school_name, division_name)
values
  ('4c000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-0000000000a1',
   'EMP-C001', 'Sample School', 'Sample Division');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('5c000000-0000-4000-8000-000000000001', 'bc000000-0000-4000-8000-0000000000b1',
   'LRN-C00001', (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('cc000000-0000-4000-8000-000000000001', 'CASE-COMP-1',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Case competency', 'published');

-- ---------------------------------------------------------------------------
-- A learner may not open, update or audit anything
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"bc000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select throws_ok(
  $$ select app.open_intervention(
       '5c000000-0000-4000-8000-000000000001',
       'cc000000-0000-4000-8000-000000000001',
       'HIGH', 'One-on-One Remediation', 'Let me off.'
     ) $$,
  '42501',
  'Only a Teacher/Administrator may record an intervention',
  'A learner cannot open a case about themselves'
);

select throws_ok(
  $$ select app.record_audit_event('intervention.recorded', 'intervention') $$,
  '42501',
  'Only a Teacher/Administrator may record an audit event',
  'A learner cannot write the audit trail'
);

-- ---------------------------------------------------------------------------
-- The educator records a case
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"ac000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is(
  (select opened.status
   from app.open_intervention(
     '5c000000-0000-4000-8000-000000000001',
     'cc000000-0000-4000-8000-000000000001',
     'HIGH', 'One-on-One Remediation',
     'Scheduled a 15-minute guided number-line session.'
   ) as opened),
  'In Progress'::app.intervention_status,
  'Recording an action puts the case In Progress'
);

select is(
  (select interventions.teacher_admin_id from app.interventions),
  '4c000000-0000-4000-8000-000000000001'::uuid,
  'The case names the educator who called, taken from auth.uid()'
);

select is(
  (select count(*) from app.audit_events
   where audit_events.action = 'intervention.recorded'),
  1::bigint,
  'Recording a case writes its audit row in the same transaction'
);

select is(
  (select opened.intervention_id
   from app.open_intervention(
     '5c000000-0000-4000-8000-000000000001',
     'cc000000-0000-4000-8000-000000000001',
     'MEDIUM', 'Additional Exercise', 'Second action on the same case.'
   ) as opened),
  (select interventions.intervention_id from app.interventions),
  'A second action records against the open case rather than duplicating it'
);

select is(
  (select count(*) from app.interventions),
  1::bigint,
  'One learner and one competency hold one live case'
);

-- ---------------------------------------------------------------------------
-- The lifecycle is enforced, not trusted
-- ---------------------------------------------------------------------------
select is(
  (select updated.status
   from app.update_intervention(
     (select intervention_id from app.interventions),
     p_status => 'Resolved'::app.intervention_status
   ) as updated),
  'Resolved'::app.intervention_status,
  'An In Progress case may be resolved'
);

select ok(
  (select interventions.resolved_at from app.interventions) is not null,
  'A resolved case records when it was resolved'
);

select throws_ok(
  $$ select app.update_intervention(
       (select intervention_id from app.interventions),
       p_status => 'Needs Intervention'::app.intervention_status
     ) $$,
  '23514',
  'A resolved case may only reopen to In Progress',
  'A resolved case cannot be pushed back to the start of the queue'
);

select throws_ok(
  $$ select app.update_intervention(
       (select intervention_id from app.interventions),
       p_status => 'In Progress'::app.intervention_status
     ) $$,
  '23514',
  'Reopening a resolved case needs a reason',
  'Reopening without a reason is refused'
);

select is(
  (select reopened.reopen_reason
   from app.update_intervention(
     (select intervention_id from app.interventions),
     p_status => 'In Progress'::app.intervention_status,
     p_reopen_reason => 'The learner regressed on the follow-up activity.'
   ) as reopened),
  'The learner regressed on the follow-up activity.',
  'Reopening with a reason records the reason'
);

select ok(
  (select interventions.resolved_at from app.interventions) is null,
  'A reopened case is no longer resolved'
);

-- Two updates were accepted: resolving, and reopening with a reason. The two
-- refused ones raised instead, so they left no audit row behind.
select is(
  (select count(*) from app.audit_events
   where audit_events.action = 'intervention.updated'),
  2::bigint,
  'Every accepted transition is audited, and only the accepted ones'
);

-- ---------------------------------------------------------------------------
-- Archiving keeps the trail
-- ---------------------------------------------------------------------------
select ok(
  app.archive_intervention((select intervention_id from app.interventions)),
  'A case can be archived'
);

select ok(
  not app.archive_intervention((select intervention_id from app.interventions)),
  'Archiving an already archived case reports that nothing changed'
);

select is(
  (select count(*) from app.interventions),
  1::bigint,
  'Archiving does not delete the case'
);

select is(
  (select count(*) from app.audit_events
   where audit_events.action = 'intervention.archived'),
  1::bigint,
  'Archiving is audited once'
);

reset role;

select * from finish();
rollback;
