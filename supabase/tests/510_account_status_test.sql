-- MathSmart Phase 5b — account status enforcement.
--
-- A signed-out or deleted user still holds a cryptographically valid access
-- token until it expires. Suspension therefore has to be answered by the
-- database on every request, and these tests prove it is: a suspended learner
-- and an archived Teacher/Administrator lose every path at once, including a
-- repository reached directly with no application check in front of it.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- The helper, and its hardening
-- ---------------------------------------------------------------------------
select has_function('app'::name, 'is_active_account'::name, 'app.is_active_account exists');

select ok(
  (select pg_proc.prosecdef
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app' and pg_proc.proname = 'is_active_account'),
  'app.is_active_account is SECURITY DEFINER, because a policy on the table it reads consults it'
);

select ok(
  (select pg_proc.proconfig::text like '%search_path%'
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app' and pg_proc.proname = 'is_active_account'),
  'app.is_active_account pins its search_path, so every name inside it is schema-qualified'
);

select is(
  (select pg_proc.pronargs
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app' and pg_proc.proname = 'is_active_account'),
  0::smallint,
  'app.is_active_account takes no parameter, so there is no input to probe another account with'
);

select ok(not has_function_privilege('anon', 'app.is_active_account()', 'execute'),
          'anon cannot execute app.is_active_account');
select ok(has_function_privilege('authenticated', 'app.is_active_account()', 'execute'),
          'authenticated can execute app.is_active_account');

-- ---------------------------------------------------------------------------
-- Every table carries the restrictive policy
-- ---------------------------------------------------------------------------
select is(
  (select count(*)
   from pg_class
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'app'
     and pg_class.relkind = 'r'
     and not exists (
       select 1
       from pg_policy
       where pg_policy.polrelid = pg_class.oid
         and pg_policy.polname = pg_class.relname || '_requires_an_active_account'
     )),
  0::bigint,
  'Every table in the app schema requires an active account'
);

select is(
  (select count(*)
   from pg_policy
   join pg_class on pg_class.oid = pg_policy.polrelid
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'app'
     and pg_policy.polname like '%_requires_an_active_account'
     and pg_policy.polpermissive),
  0::bigint,
  'Each account-status policy is restrictive, so it is ANDed with the permissive rules'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a8000000-0000-4000-8000-0000000000a1', 'status.adviser@mathsmart.test'),
  ('b8000000-0000-4000-8000-0000000000b1', 'status.learner@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('a8000000-0000-4000-8000-0000000000a1', 'Status Adviser', 'status.adviser@mathsmart.test', 'teacher_admin'),
  ('b8000000-0000-4000-8000-0000000000b1', 'Status Learner', 'status.learner@mathsmart.test', 'student');

insert into app.teacher_admin_profiles (user_id, employee_id, school_name, division_name) values
  ('a8000000-0000-4000-8000-0000000000a1', 'EMP-8001', 'Sample School', 'Sample Division');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('58000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-0000000000b1', 'LRN-800001',
   (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('c8000000-0000-4000-8000-000000000001', 'STATUS-COMP-1',
   (select grade_id from app.grade_levels where level = 6), 'Number Sense', 'Status competency', 'published');

insert into app.competency_progress
  (student_id, competency_id, current_score, mastery_band)
values
  ('58000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 40.00, 'Needs Improvement');

-- ===========================================================================
-- While the account is active, everything works as before
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"b8000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select ok((select app.is_active_account()), 'An active learner is recognised as active');

select is((select count(*) from app.student_profiles
            where student_profiles.learner_id = 'LRN-800001'), 1::bigint,
          'An active learner reads their own record');

select is((select count(*) from app.competency_progress
            where competency_progress.competency_id = 'c8000000-0000-4000-8000-000000000001'), 1::bigint,
          'An active learner reads their own progress');

select isnt_empty($$ select 1 from app.grade_levels where level = 6 $$,
                  'An active learner reads active curriculum organisation');

-- ===========================================================================
-- Suspending the learner closes every path, with the same valid token
-- ===========================================================================
reset role;

update app.user_profiles set account_status = 'suspended'
where user_profiles.user_id = 'b8000000-0000-4000-8000-0000000000b1';

set local request.jwt.claims = '{"sub":"b8000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select ok(not app.is_active_account(), 'A suspended learner is not recognised as active');

select is_empty($$ select 1 from app.student_profiles
                   where student_profiles.learner_id = 'LRN-800001' $$,
                'A suspended learner cannot read their own record');

select is_empty($$ select 1 from app.competency_progress $$,
                'A suspended learner cannot read their own progress');

select is_empty($$ select 1 from app.user_profiles $$,
                'A suspended learner cannot read their own profile');

select is_empty($$ select 1 from app.grade_levels $$,
                'A suspended learner cannot read curriculum organisation');

select is_empty($$ select 1 from app.competencies $$,
                'A suspended learner cannot read published content');

-- ===========================================================================
-- Reactivating restores access, so suspension is reversible
-- ===========================================================================
reset role;

update app.user_profiles set account_status = 'active'
where user_profiles.user_id = 'b8000000-0000-4000-8000-0000000000b1';

set local request.jwt.claims = '{"sub":"b8000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is((select count(*) from app.student_profiles
            where student_profiles.learner_id = 'LRN-800001'), 1::bigint,
          'Reactivating a learner restores their access');

-- ===========================================================================
-- The same holds for an archived Teacher/Administrator
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"a8000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is((select count(*) from app.student_profiles
            where student_profiles.learner_id = 'LRN-800001'), 1::bigint,
          'An active teacher_admin reads learner records school-wide');

reset role;

update app.user_profiles
set account_status = 'archived', archived_at = now()
where user_profiles.user_id = 'a8000000-0000-4000-8000-0000000000a1';

set local request.jwt.claims = '{"sub":"a8000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select ok(not app.is_active_account(), 'An archived teacher_admin is not recognised as active');

select is_empty($$ select 1 from app.student_profiles $$,
                'An archived teacher_admin cannot read learner records');

select is_empty($$ select 1 from app.interventions $$,
                'An archived teacher_admin cannot read intervention cases');

select is_empty($$ select 1 from app.system_settings $$,
                'An archived teacher_admin cannot read global configuration');

-- A write is refused as well, not merely filtered.
select throws_ok(
  $$ insert into app.sections (grade_id, name)
     values ('00000000-0000-4000-8000-00000000dead', 'Archived Section') $$,
  '42501', null::text,
  'An archived teacher_admin cannot create a section'
);

select throws_ok(
  $$ insert into app.competencies (code, grade_id, domain, name)
     values ('STATUS-COMP-9', '00000000-0000-4000-8000-00000000dead', 'Geometry', 'Rogue') $$,
  '42501', null::text,
  'An archived teacher_admin cannot author content'
);

reset role;

select * from finish();

rollback;
