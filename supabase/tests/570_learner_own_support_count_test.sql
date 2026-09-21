-- MathSmart — a learner's view of their own teacher support.
--
-- `app.own_open_intervention_count()` exists so a learner's dashboard can say
-- "your teacher is preparing extra support" without the learner ever reading
-- an intervention row. These tests hold it to that: one integer, only for the
-- caller, only open or in-progress cases, nothing for anybody who is not a
-- learner, and the table itself still closed to learners.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Its shape, and who may call it
-- ---------------------------------------------------------------------------
select has_function(
  'app', 'own_open_intervention_count', array[]::name[],
  'The function takes no argument, so there is no learner to aim it at'
);

select function_returns(
  'app', 'own_open_intervention_count', array[]::name[], 'integer',
  'It returns one number and nothing a row could carry'
);

select ok(
  not has_function_privilege('anon', 'app.own_open_intervention_count()', 'execute'),
  'anon cannot ask'
);

select ok(
  has_function_privilege('authenticated', 'app.own_open_intervention_count()', 'execute'),
  'A signed-in caller may ask; the function decides what they get'
);

-- ---------------------------------------------------------------------------
-- Fixture: two learners, one educator, cases in every state
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('ae000000-0000-4000-8000-0000000000a1', 'support.adviser@mathsmart.test'),
  ('be000000-0000-4000-8000-0000000000b1', 'support.learner.one@mathsmart.test'),
  ('be000000-0000-4000-8000-0000000000b2', 'support.learner.two@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('ae000000-0000-4000-8000-0000000000a1', 'Support Adviser',
   'support.adviser@mathsmart.test', 'teacher_admin'),
  ('be000000-0000-4000-8000-0000000000b1', 'Support Learner One',
   'support.learner.one@mathsmart.test', 'student'),
  ('be000000-0000-4000-8000-0000000000b2', 'Support Learner Two',
   'support.learner.two@mathsmart.test', 'student');

insert into app.teacher_admin_profiles
  (teacher_admin_id, user_id, employee_id, school_name, division_name)
values
  ('4e000000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-0000000000a1',
   'EMP-E001', 'Sample School', 'Sample Division');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('5e100000-0000-4000-8000-000000000001', 'be000000-0000-4000-8000-0000000000b1',
   'LRN-E10001', (select grade_id from app.grade_levels where level = 6)),
  ('5e100000-0000-4000-8000-000000000002', 'be000000-0000-4000-8000-0000000000b2',
   'LRN-E10002', (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('ce000000-0000-4000-8000-000000000001', 'SUPPORT-COMP-1',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Support competency one', 'published'),
  ('ce000000-0000-4000-8000-000000000002', 'SUPPORT-COMP-2',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Support competency two', 'published'),
  ('ce000000-0000-4000-8000-000000000003', 'SUPPORT-COMP-3',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Support competency three', 'published'),
  ('ce000000-0000-4000-8000-000000000004', 'SUPPORT-COMP-4',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Support competency four', 'published');

-- Learner one: one waiting, one being worked on, one finished, one archived.
-- Only the first two are support happening now.
insert into app.interventions
  (student_id, teacher_admin_id, competency_id, severity, status,
   intervention_type, educator_notes, recorded_at, resolved_at, archived_at)
values
  ('5e100000-0000-4000-8000-000000000001', '4e000000-0000-4000-8000-000000000001',
   'ce000000-0000-4000-8000-000000000001', 'HIGH', 'Needs Intervention',
   'Additional Exercise', 'Private: struggles with place value.', now(), null, null),
  ('5e100000-0000-4000-8000-000000000001', '4e000000-0000-4000-8000-000000000001',
   'ce000000-0000-4000-8000-000000000002', 'MEDIUM', 'In Progress',
   'One-on-One Remediation', 'Private: number line on Thursday.', now(), null, null),
  ('5e100000-0000-4000-8000-000000000001', '4e000000-0000-4000-8000-000000000001',
   'ce000000-0000-4000-8000-000000000003', 'LOW', 'Resolved',
   'Teacher Consultation', 'Private: resolved.', now(), now(), null),
  ('5e100000-0000-4000-8000-000000000001', '4e000000-0000-4000-8000-000000000001',
   'ce000000-0000-4000-8000-000000000004', 'LOW', 'In Progress',
   'Other', 'Private: opened by mistake.', now(), null, now());

-- Learner two: a case of their own, which learner one must never count.
insert into app.interventions
  (student_id, teacher_admin_id, competency_id, severity, status,
   intervention_type, educator_notes)
values
  ('5e100000-0000-4000-8000-000000000002', '4e000000-0000-4000-8000-000000000001',
   'ce000000-0000-4000-8000-000000000001', 'HIGH', 'Needs Intervention',
   'Additional Exercise', 'Private: learner two.');

-- ---------------------------------------------------------------------------
-- Learner one sees their own open support, and nothing else
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"be000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  app.own_open_intervention_count(),
  2,
  'A learner counts their own open and in-progress cases, not resolved or archived ones'
);

-- The count is the whole answer. The rows behind it stay closed.
select is_empty(
  $$ select 1 from app.interventions $$,
  'A learner still cannot read a single intervention row'
);

select is_empty(
  $$ select 1 from app.interventions where educator_notes is not null $$,
  'A learner still cannot read any educator note'
);

-- ---------------------------------------------------------------------------
-- Learner two sees only their own
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"be000000-0000-4000-8000-0000000000b2","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  app.own_open_intervention_count(),
  1,
  'Another learner counts only their own case, never the first learner''s'
);

-- ---------------------------------------------------------------------------
-- An educator is not a learner, and is not given a learner's answer
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"ae000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is(
  app.own_open_intervention_count(),
  null,
  'A caller without a learner profile gets no number at all'
);

-- ---------------------------------------------------------------------------
-- A caller nobody knows gets nothing
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"ffffffff-ffff-4fff-8fff-ffffffffffff","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  app.own_open_intervention_count(),
  null,
  'A token for somebody with no profile gets no number'
);

-- ---------------------------------------------------------------------------
-- A suspended learner is refused here as everywhere else
-- ---------------------------------------------------------------------------
reset role;
update app.user_profiles
set account_status = 'suspended'
where user_id = 'be000000-0000-4000-8000-0000000000b1';

set local request.jwt.claims = '{"sub":"be000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  app.own_open_intervention_count(),
  null,
  'A suspended account is not told anything'
);

-- ---------------------------------------------------------------------------
-- A forged role in user_metadata changes nothing
-- ---------------------------------------------------------------------------
reset role;
update app.user_profiles
set account_status = 'active'
where user_id = 'be000000-0000-4000-8000-0000000000b1';

set local request.jwt.claims = '{"sub":"be000000-0000-4000-8000-0000000000b2","role":"authenticated","app_metadata":{"role":"student"},"user_metadata":{"role":"teacher_admin","student_id":"5e100000-0000-4000-8000-000000000001"}}';
set local role authenticated;

select is(
  app.own_open_intervention_count(),
  1,
  'Claims in user_metadata cannot point the count at another learner'
);

select * from finish();

rollback;
