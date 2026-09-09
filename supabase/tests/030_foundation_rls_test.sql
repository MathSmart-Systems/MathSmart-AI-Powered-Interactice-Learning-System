-- MathSmart Phase 1 — Row Level Security behaviour.
--
-- Impersonates each caller the way PostgREST does — set the request claims, then
-- switch into the matching database role — and asserts both the allowed and the
-- denied path for anonymous callers, learners, and Teacher/Administrators.
--
-- How a denial shows up matters, so the assertions differ on purpose:
--   * A missing grant raises 42501 and is asserted with throws_ok.
--   * A WITH CHECK violation raises 42501 and is asserted with throws_ok.
--   * A USING clause that filters the row out raises nothing and simply matches
--     zero rows, so the write is run and the target row is then re-read as the
--     owner to prove it is intact.
--
-- Allowed writes are never proved with lives_ok, which also passes when a
-- statement matches zero rows. Each one is re-read instead.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures, created as the migration owner
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-0000000000a1', 'adviser@mathsmart.test'),
  ('b0000000-0000-4000-8000-0000000000b1', 'learner.one@mathsmart.test'),
  ('b0000000-0000-4000-8000-0000000000b2', 'learner.two@mathsmart.test'),
  ('b0000000-0000-4000-8000-0000000000b3', 'learner.unenrolled@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('a0000000-0000-4000-8000-0000000000a1', 'Adviser One', 'adviser@mathsmart.test', 'teacher_admin'),
  ('b0000000-0000-4000-8000-0000000000b1', 'Learner One', 'learner.one@mathsmart.test', 'student'),
  ('b0000000-0000-4000-8000-0000000000b2', 'Learner Two', 'learner.two@mathsmart.test', 'student'),
  ('b0000000-0000-4000-8000-0000000000b3', 'Learner Unenrolled', 'learner.unenrolled@mathsmart.test', 'student');

insert into app.teacher_admin_profiles (teacher_admin_id, user_id, employee_id, school_name, division_name) values
  ('a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000a1',
   'EMP-9001', 'Sample Central Elementary School', 'Sample Division');

-- An archived grade, so "learners see active content only" is testable.
insert into app.grade_levels (name, level, is_active) values ('Grade 5', 5, false);

insert into app.sections (section_id, grade_id, name) values
  ('e0000000-0000-4000-8000-0000000000a1', (select grade_id from app.grade_levels where level = 6), 'Section Alpha'),
  ('e0000000-0000-4000-8000-0000000000b1', (select grade_id from app.grade_levels where level = 6), 'Section Beta');

insert into app.student_profiles (user_id, learner_id, grade_id, section_id) values
  ('b0000000-0000-4000-8000-0000000000b1', 'LRN-900001',
   (select grade_id from app.grade_levels where level = 6), 'e0000000-0000-4000-8000-0000000000a1'),
  ('b0000000-0000-4000-8000-0000000000b2', 'LRN-900002',
   (select grade_id from app.grade_levels where level = 6), 'e0000000-0000-4000-8000-0000000000b1');

-- ===========================================================================
-- Anonymous callers
-- ===========================================================================
reset role;
set local request.jwt.claims = '';
set local role anon;

select throws_ok($$ select 1 from app.user_profiles $$,          '42501', null::text, 'An anonymous caller cannot read application profiles');
select throws_ok($$ select 1 from app.student_profiles $$,       '42501', null::text, 'An anonymous caller cannot read learner records');
select throws_ok($$ select 1 from app.teacher_admin_profiles $$, '42501', null::text, 'An anonymous caller cannot read Teacher/Administrator records');
select throws_ok($$ select 1 from app.sections $$,               '42501', null::text, 'An anonymous caller cannot read sections');
select throws_ok($$ select 1 from app.grade_levels $$,           '42501', null::text, 'An anonymous caller cannot read grade levels');
select throws_ok($$ insert into app.grade_levels (name, level) values ('Grade 1', 1) $$,
                 '42501', null::text, 'An anonymous caller cannot create school records');

-- ===========================================================================
-- Learner One
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is((select count(*) from app.user_profiles), 1::bigint,
          'A learner sees only their own application profile');

select is_empty($$ select 1 from app.user_profiles where user_id = 'b0000000-0000-4000-8000-0000000000b2' $$,
                'A learner cannot read another learner''s profile');

select is((select count(*) from app.student_profiles), 1::bigint,
          'A learner sees only their own learner record');

select is((select learner_id from app.student_profiles), 'LRN-900001',
          'A learner reads their own learner record');

select is_empty($$ select 1 from app.student_profiles where learner_id = 'LRN-900002' $$,
                'A learner cannot read another learner''s record');

select is_empty($$ select 1 from app.teacher_admin_profiles $$,
                'A learner cannot read Teacher/Administrator records');

select is((select count(*) from app.sections), 1::bigint,
          'A learner sees only the section they are enrolled in');

select is((select section_id from app.sections), 'e0000000-0000-4000-8000-0000000000a1'::uuid,
          'The section a learner sees is their own');

-- Asserting the property rather than the table size, so seeding another grade
-- level in a later phase cannot turn this into a false failure.
select is((select count(*) from app.grade_levels where not is_active), 0::bigint,
          'A learner sees active grade levels only');

-- Privilege-level denials.
select throws_ok($$ update app.user_profiles set role = 'teacher_admin'
                    where user_id = 'b0000000-0000-4000-8000-0000000000b1' $$,
                 '42501', null::text, 'A learner cannot change their own role');

select throws_ok($$ delete from app.student_profiles where learner_id = 'LRN-900001' $$,
                 '42501', null::text, 'A learner cannot delete learner records');

select throws_ok($$ delete from app.sections where section_id = 'e0000000-0000-4000-8000-0000000000a1' $$,
                 '42501', null::text, 'A learner cannot delete sections');

-- WITH CHECK denials.
select throws_ok($$ insert into app.grade_levels (name, level) values ('Grade 1', 1) $$,
                 '42501', null::text, 'A learner cannot create a grade level');

select throws_ok($$ insert into app.sections (grade_id, name)
                    values ((select grade_id from app.grade_levels where level = 6), 'Rogue Section') $$,
                 '42501', null::text, 'A learner cannot create a section');

select throws_ok($$ insert into app.student_profiles (user_id, learner_id, grade_id)
                    values ('b0000000-0000-4000-8000-0000000000b3', 'LRN-900003',
                            (select grade_id from app.grade_levels where level = 6)) $$,
                 '42501', null::text, 'A learner cannot enrol anybody, including themselves');

-- USING denials: these match zero rows rather than raising. The writes are run
-- here and the target rows are re-read as the owner further below.
update app.student_profiles set monitoring_status = 'mastered' where learner_id = 'LRN-900001';
update app.student_profiles set learner_id = 'LRN-999999' where learner_id = 'LRN-900001';
update app.user_profiles set full_name = 'Tampered Name' where user_id = 'b0000000-0000-4000-8000-0000000000b2';
update app.sections set name = 'Renamed Section' where section_id = 'e0000000-0000-4000-8000-0000000000a1';

-- The one write a learner is allowed, proved by re-reading it.
update app.user_profiles set full_name = 'Learner One Preferred'
where user_id = 'b0000000-0000-4000-8000-0000000000b1';

select is((select full_name from app.user_profiles where user_id = 'b0000000-0000-4000-8000-0000000000b1'),
          'Learner One Preferred',
          'A learner can update their own display name');

reset role;

select is((select monitoring_status from app.student_profiles where learner_id = 'LRN-900001'),
          'active'::app.monitoring_status,
          'A learner cannot change their own monitoring status');

select is((select count(*) from app.student_profiles where learner_id = 'LRN-900001'), 1::bigint,
          'A learner cannot change their own learner_id');

select is((select full_name from app.user_profiles where user_id = 'b0000000-0000-4000-8000-0000000000b2'),
          'Learner Two',
          'A learner cannot rename another learner');

select is((select name from app.sections where section_id = 'e0000000-0000-4000-8000-0000000000a1'),
          'Section Alpha',
          'A learner cannot rename a section');

-- ===========================================================================
-- Learner Two — cross-learner isolation from the other side
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-0000000000b2","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is((select learner_id from app.student_profiles), 'LRN-900002',
          'The second learner reads only their own record');

select is_empty($$ select 1 from app.student_profiles where learner_id = 'LRN-900001' $$,
                'The second learner cannot read the first learner''s record');

select is((select section_id from app.sections), 'e0000000-0000-4000-8000-0000000000b1'::uuid,
          'The second learner sees only their own section');

-- ===========================================================================
-- Teacher/Administrator — documented school-wide scope
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select ok((select count(*) from app.user_profiles) >= 4::bigint,
          'A teacher_admin reads application profiles school-wide');

select is((select count(*) from app.student_profiles
            where student_profiles.learner_id in ('LRN-900001', 'LRN-900002')), 2::bigint,
          'A teacher_admin reads every learner record');

select is((select count(*) from app.sections where name in ('Section Alpha', 'Section Beta')), 2::bigint,
          'A teacher_admin reads every section');

select is((select count(*) from app.grade_levels
            where not is_active and grade_levels.level = 5), 1::bigint,
          'A teacher_admin also sees archived grade levels');

select isnt_empty($$ select 1 from app.teacher_admin_profiles $$,
                  'A teacher_admin reads Teacher/Administrator records');

-- Allowed writes, each proved by re-reading the row.
update app.student_profiles set monitoring_status = 'needs_intervention' where learner_id = 'LRN-900002';

select is((select monitoring_status from app.student_profiles where learner_id = 'LRN-900002'),
          'needs_intervention'::app.monitoring_status,
          'A teacher_admin can update a learner''s monitoring status');

update app.sections set adviser_id = 'a0000000-0000-4000-8000-0000000000f1'
where section_id = 'e0000000-0000-4000-8000-0000000000b1';

select is((select adviser_id from app.sections where section_id = 'e0000000-0000-4000-8000-0000000000b1'),
          'a0000000-0000-4000-8000-0000000000f1'::uuid,
          'A teacher_admin can assign a section adviser');

insert into app.sections (grade_id, name)
values ((select grade_id from app.grade_levels where level = 6), 'Section Gamma');

select is((select count(*) from app.sections where name = 'Section Gamma'), 1::bigint,
          'A teacher_admin can create a section');

update app.student_profiles set section_id = 'e0000000-0000-4000-8000-0000000000b1'
where learner_id = 'LRN-900001';

select is((select section_id from app.student_profiles where learner_id = 'LRN-900001'),
          'e0000000-0000-4000-8000-0000000000b1'::uuid,
          'A teacher_admin can move a learner between sections');

-- Still denied, even school-wide.
select throws_ok($$ update app.user_profiles set role = 'student'
                    where user_id = 'a0000000-0000-4000-8000-0000000000a1' $$,
                 '42501', null::text,
                 'A teacher_admin cannot change a role through the Data API roles; that is a backend operation');

select throws_ok($$ delete from app.sections where name = 'Section Gamma' $$,
                 '42501', null::text,
                 'A teacher_admin cannot delete a section; archiving is the supported path');

select throws_ok($$ delete from app.user_profiles where user_id = 'b0000000-0000-4000-8000-0000000000b3' $$,
                 '42501', null::text,
                 'A teacher_admin cannot delete an application profile');

-- ===========================================================================
-- Untrusted and unrecognised claims
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"},"user_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is((select count(*) from app.student_profiles), 1::bigint,
          'A teacher_admin role in user_metadata grants no school-wide access');

reset role;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"super_admin"}}';
set local role authenticated;

select is((select count(*) from app.student_profiles), 0::bigint,
          'An unrecognised role claim grants no learner access');

reset role;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
set local role authenticated;

select is((select count(*) from app.student_profiles), 0::bigint,
          'A token with no role claim grants no learner access');

reset role;

select * from finish();

rollback;
