-- MathSmart Phase 1 — relationship and constraint verification.
--
-- Proves the valid shapes MathSmart must support and the invalid ones it must
-- reject. Runs with the migration owner's privileges so that RLS is not the
-- subject here; row-level behaviour is covered by 030_foundation_rls_test.sql.
--
-- Fixture identities use the reserved `.test` TLD, hold no credentials, and are
-- rolled back with the surrounding transaction.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'adviser.one@mathsmart.test'),
  ('a0000000-0000-4000-8000-000000000002', 'adviser.two@mathsmart.test'),
  ('b0000000-0000-4000-8000-000000000001', 'learner.one@mathsmart.test'),
  ('b0000000-0000-4000-8000-000000000002', 'learner.two@mathsmart.test'),
  ('b0000000-0000-4000-8000-000000000003', 'learner.three@mathsmart.test'),
  ('c0000000-0000-4000-8000-000000000001', 'removable@mathsmart.test'),
  ('d0000000-0000-4000-8000-000000000001', 'unprofiled@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('a0000000-0000-4000-8000-000000000001', 'Adviser One', 'adviser.one@mathsmart.test', 'teacher_admin'),
  ('a0000000-0000-4000-8000-000000000002', 'Adviser Two', 'adviser.two@mathsmart.test', 'teacher_admin'),
  ('b0000000-0000-4000-8000-000000000001', 'Learner One', 'learner.one@mathsmart.test', 'student'),
  ('b0000000-0000-4000-8000-000000000002', 'Learner Two', 'learner.two@mathsmart.test', 'student'),
  ('b0000000-0000-4000-8000-000000000003', 'Learner Three', 'learner.three@mathsmart.test', 'student'),
  ('c0000000-0000-4000-8000-000000000001', 'Removable Learner', 'removable@mathsmart.test', 'student');

-- A second grade level, so cross-grade rules can be exercised.
insert into app.grade_levels (name, level, is_active) values ('Grade 5', 5, true);

-- ---------------------------------------------------------------------------
-- Grade 6 arrives from the migration chain
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from app.grade_levels where level = 6 and name = 'Grade 6' and is_active),
  1::bigint,
  'Grade 6 exists and is active without any manual Dashboard step'
);

-- ---------------------------------------------------------------------------
-- A teacher_admin can be created and assigned as a section adviser
-- ---------------------------------------------------------------------------
insert into app.teacher_admin_profiles (user_id, employee_id, school_name, division_name) values
  ('a0000000-0000-4000-8000-000000000001', 'EMP-0001', 'Sample Central Elementary School', 'Sample Division'),
  ('a0000000-0000-4000-8000-000000000002', 'EMP-0002', 'Sample Central Elementary School', 'Sample Division');

select is(
  (select employee_id from app.teacher_admin_profiles where user_id = 'a0000000-0000-4000-8000-000000000001'),
  'EMP-0001',
  'A Teacher/Administrator profile can be created for a teacher_admin Auth user'
);

insert into app.sections (grade_id, adviser_id, name) values
  (
    (select grade_id from app.grade_levels where level = 6),
    (select teacher_admin_id from app.teacher_admin_profiles where employee_id = 'EMP-0001'),
    'Section A'
  ),
  (
    (select grade_id from app.grade_levels where level = 6),
    null,
    'Section B'
  ),
  (
    (select grade_id from app.grade_levels where level = 5),
    null,
    'Section A'
  );

select is(
  (select employee_id
   from app.sections
   join app.teacher_admin_profiles on teacher_admin_profiles.teacher_admin_id = sections.adviser_id
   where sections.name = 'Section A'
     and sections.grade_id = (select grade_id from app.grade_levels where level = 6)),
  'EMP-0001',
  'A teacher_admin can be assigned as the adviser of a Grade 6 section'
);

select is(
  (select count(*) from app.sections
    where sections.name = 'Section A'
      and sections.grade_id in (
        (select grade_id from app.grade_levels where level = 6),
        (select grade_id from app.grade_levels where level = 5))),
  2::bigint,
  'The same section name may be reused in a different grade'
);

-- ---------------------------------------------------------------------------
-- A student can be enrolled in a Grade 6 section
-- ---------------------------------------------------------------------------
insert into app.student_profiles (user_id, learner_id, grade_id, section_id) values
  (
    'b0000000-0000-4000-8000-000000000001',
    'LRN-000001',
    (select grade_id from app.grade_levels where level = 6),
    (select section_id from app.sections
      where name = 'Section A'
        and grade_id = (select grade_id from app.grade_levels where level = 6))
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'LRN-000002',
    (select grade_id from app.grade_levels where level = 6),
    (select section_id from app.sections
      where name = 'Section B'
        and grade_id = (select grade_id from app.grade_levels where level = 6))
  );

select is(
  (select count(*)
   from app.student_profiles
   join app.grade_levels on grade_levels.grade_id = student_profiles.grade_id
   where grade_levels.level = 6
     and student_profiles.learner_id in ('LRN-000001', 'LRN-000002')),
  2::bigint,
  'A student can be associated with a Grade 6 section'
);

select is(
  (select monitoring_status from app.student_profiles where learner_id = 'LRN-000001'),
  'active'::app.monitoring_status,
  'A newly enrolled learner starts in the active monitoring status'
);

-- A learner may be enrolled without a section yet.
insert into app.student_profiles (user_id, learner_id, grade_id) values
  ('b0000000-0000-4000-8000-000000000003', 'LRN-000003', (select grade_id from app.grade_levels where level = 6));

select ok(
  (select section_id is null from app.student_profiles where learner_id = 'LRN-000003'),
  'A learner can exist before a section is assigned'
);

-- ---------------------------------------------------------------------------
-- Identity uniqueness
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.student_profiles (user_id, learner_id, grade_id)
     values ('c0000000-0000-4000-8000-000000000001', 'LRN-000001',
             (select grade_id from app.grade_levels where level = 6)) $$,
  '23505',
  null::text,
  'A duplicate learner_id is rejected'
);

select throws_ok(
  $$ insert into app.teacher_admin_profiles (user_id, employee_id, school_name, division_name)
     values ('c0000000-0000-4000-8000-000000000001', 'EMP-0001', 'Sample Central Elementary School', 'Sample Division') $$,
  '23505',
  null::text,
  'A duplicate employee_id is rejected'
);

select throws_ok(
  $$ insert into app.student_profiles (user_id, learner_id, grade_id)
     values ('b0000000-0000-4000-8000-000000000001', 'LRN-999999',
             (select grade_id from app.grade_levels where level = 6)) $$,
  '23505',
  null::text,
  'One Auth user cannot hold two learner records'
);

select throws_ok(
  $$ insert into app.user_profiles (user_id, full_name, email, role)
     values ('b0000000-0000-4000-8000-000000000001', 'Duplicate Profile', 'duplicate@mathsmart.test', 'student') $$,
  '23505',
  null::text,
  'One Auth user cannot hold two application profiles'
);

select throws_ok(
  $$ insert into app.user_profiles (user_id, full_name, email, role)
     values ('d0000000-0000-4000-8000-000000000001', 'Shared Email', 'learner.one@mathsmart.test', 'student') $$,
  '23505',
  null::text,
  'Two application profiles cannot share an email address'
);

-- ---------------------------------------------------------------------------
-- Role integrity
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.user_profiles (user_id, full_name, email, role)
     values ('c0000000-0000-4000-8000-000000000001', 'Invalid Role', 'invalid.role@mathsmart.test', 'admin') $$,
  '22P02',
  null::text,
  'A role outside student and teacher_admin is rejected'
);

select throws_ok(
  $$ insert into app.student_profiles (user_id, learner_id, grade_id)
     values ('a0000000-0000-4000-8000-000000000002', 'LRN-000404',
             (select grade_id from app.grade_levels where level = 6)) $$,
  '23503',
  null::text,
  'A teacher_admin Auth user cannot hold a learner record'
);

select throws_ok(
  $$ insert into app.teacher_admin_profiles (user_id, employee_id, school_name, division_name)
     values ('b0000000-0000-4000-8000-000000000002', 'EMP-0404', 'Sample Central Elementary School', 'Sample Division') $$,
  '23503',
  null::text,
  'A student Auth user cannot hold a Teacher/Administrator record'
);

select throws_ok(
  $$ insert into app.student_profiles (user_id, role, learner_id, grade_id)
     values ('c0000000-0000-4000-8000-000000000001', 'teacher_admin', 'LRN-000405',
             (select grade_id from app.grade_levels where level = 6)) $$,
  '23514',
  null::text,
  'A learner record cannot claim the teacher_admin role'
);

select throws_ok(
  $$ insert into app.user_profiles (user_id, full_name, email, role)
     values ('00000000-0000-4000-8000-00000000dead', 'Ghost User', 'ghost@mathsmart.test', 'student') $$,
  '23503',
  null::text,
  'An application profile requires a real Supabase Auth user'
);

-- ---------------------------------------------------------------------------
-- School-organisation integrity
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.student_profiles (user_id, learner_id, grade_id, section_id)
     values ('c0000000-0000-4000-8000-000000000001', 'LRN-000406',
             (select grade_id from app.grade_levels where level = 6),
             (select section_id from app.sections
               where name = 'Section A'
                 and grade_id = (select grade_id from app.grade_levels where level = 5))) $$,
  '23503',
  null::text,
  'A learner cannot be enrolled in a section belonging to another grade'
);

select throws_ok(
  $$ insert into app.sections (grade_id, name)
     values ((select grade_id from app.grade_levels where level = 6), 'section a') $$,
  '23505',
  null::text,
  'Section names are unique within a grade regardless of case'
);

select throws_ok(
  $$ insert into app.grade_levels (name, level) values ('Grade Six', 6) $$,
  '23505',
  null::text,
  'A duplicate grade level number is rejected'
);

select throws_ok(
  $$ insert into app.grade_levels (name, level) values ('Grade 6', 4) $$,
  '23505',
  null::text,
  'A duplicate grade level name is rejected'
);

select throws_ok(
  $$ insert into app.grade_levels (name, level) values ('Grade Zero', 0) $$,
  '23514',
  null::text,
  'A grade level number outside 1 to 12 is rejected'
);

-- ---------------------------------------------------------------------------
-- Value validation
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.user_profiles (user_id, full_name, email, role)
     values ('c0000000-0000-4000-8000-000000000001', '   ', 'blank.name@mathsmart.test', 'student') $$,
  '23514',
  null::text,
  'A blank full name is rejected'
);

select throws_ok(
  $$ insert into app.user_profiles (user_id, full_name, email, role)
     values ('c0000000-0000-4000-8000-000000000001', 'Mixed Case Email', 'Mixed.Case@mathsmart.test', 'student') $$,
  '23514',
  null::text,
  'An email address must be stored normalised in lower case'
);

select throws_ok(
  $$ insert into app.user_profiles (user_id, full_name, email, role)
     values ('c0000000-0000-4000-8000-000000000001', 'Bad Email', 'not-an-email', 'student') $$,
  '23514',
  null::text,
  'A malformed email address is rejected'
);

select throws_ok(
  $$ insert into app.user_profiles (user_id, full_name, email, role, avatar_url)
     values ('c0000000-0000-4000-8000-000000000001', 'Insecure Avatar', 'insecure.avatar@mathsmart.test', 'student', 'http://example.test/a.png') $$,
  '23514',
  null::text,
  'An avatar URL must use https'
);

select throws_ok(
  $$ insert into app.student_profiles (user_id, learner_id, grade_id)
     values ('c0000000-0000-4000-8000-000000000001', 'lrn-000407',
             (select grade_id from app.grade_levels where level = 6)) $$,
  '23514',
  null::text,
  'A learner_id must be stored normalised in upper case'
);

select throws_ok(
  $$ insert into app.student_profiles (user_id, learner_id, grade_id)
     values ('c0000000-0000-4000-8000-000000000001', 'X',
             (select grade_id from app.grade_levels where level = 6)) $$,
  '23514',
  null::text,
  'A learner_id shorter than the required format is rejected'
);

select throws_ok(
  $$ update app.student_profiles set monitoring_status = 'graduated' where learner_id = 'LRN-000001' $$,
  '22P02',
  null::text,
  'A monitoring status outside the canonical vocabulary is rejected'
);

select throws_ok(
  $$ insert into app.teacher_admin_profiles (user_id, employee_id, school_name, division_name)
     values ('c0000000-0000-4000-8000-000000000001', 'EMP-0003', '  ', 'Sample Division') $$,
  '23514',
  null::text,
  'A blank school name is rejected'
);

-- ---------------------------------------------------------------------------
-- Delete behaviour
-- ---------------------------------------------------------------------------
delete from auth.users where id = 'c0000000-0000-4000-8000-000000000001';

select is(
  (select count(*) from app.user_profiles where user_id = 'c0000000-0000-4000-8000-000000000001'),
  0::bigint,
  'Removing a Supabase Auth user removes its application profile'
);

select throws_ok(
  $$ delete from app.grade_levels where level = 6 $$,
  '23503',
  null::text,
  'A grade level still referenced by learners or sections cannot be deleted'
);

select throws_ok(
  $$ delete from app.sections
     where name = 'Section A'
       and grade_id = (select grade_id from app.grade_levels where level = 6) $$,
  '23503',
  null::text,
  'A section still holding learners cannot be deleted; sections are archived instead'
);

-- Archiving is the supported path.
update app.sections
set is_active = false
where name = 'Section B'
  and grade_id = (select grade_id from app.grade_levels where level = 6);

select ok(
  (select not is_active from app.sections
    where name = 'Section B'
      and grade_id = (select grade_id from app.grade_levels where level = 6)),
  'A section can be archived without losing its enrolled learners'
);

-- Removing an adviser account leaves the section intact.
delete from auth.users where id = 'a0000000-0000-4000-8000-000000000001';

select ok(
  (select adviser_id is null from app.sections
    where name = 'Section A'
      and grade_id = (select grade_id from app.grade_levels where level = 6)),
  'Removing an adviser clears the section adviser without deleting the section'
);

-- ---------------------------------------------------------------------------
-- updated_at is server-controlled
-- ---------------------------------------------------------------------------
update app.user_profiles
set full_name = 'Learner One Renamed',
    updated_at = timestamptz 'epoch'
where user_id = 'b0000000-0000-4000-8000-000000000001';

select is(
  (select updated_at from app.user_profiles where user_id = 'b0000000-0000-4000-8000-000000000001'),
  now(),
  'The updated_at trigger replaces a client supplied value with the server clock'
);

select * from finish();

rollback;
