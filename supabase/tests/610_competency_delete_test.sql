-- MathSmart — removing a competency that was never used.
--
-- Archiving is the right answer for a competency that has been taught. This is
-- the other case: a code typed wrong, a draft abandoned, a duplicate — where
-- archiving only leaves an entry nobody can clear.
--
-- Two guards, tested apart because they fail for different reasons and protect
-- against different mistakes. The policy decides who may try and from what
-- state. The foreign keys decide whether the row is free to go at all, and
-- they are what stands between a teacher and a child's recorded work.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures, created as the migration owner
-- ---------------------------------------------------------------------------
-- Actors are created here rather than assumed from the seed: the restrictive
-- account-status policy denies everything to an id with no profile, which is
-- silent and looks exactly like a policy refusal.
insert into auth.users (id, email) values
  ('a3000000-0000-4000-8000-0000000000a1', 'delete.adviser@mathsmart.test'),
  ('b3000000-0000-4000-8000-0000000000b1', 'delete.learner@mathsmart.test');
insert into app.user_profiles (user_id, full_name, email, role) values
  ('a3000000-0000-4000-8000-0000000000a1', 'Delete Adviser',
   'delete.adviser@mathsmart.test', 'teacher_admin'),
  ('b3000000-0000-4000-8000-0000000000b1', 'Delete Learner',
   'delete.learner@mathsmart.test', 'student');
insert into app.teacher_admin_profiles (user_id, employee_id, school_name, division_name) values
  ('a3000000-0000-4000-8000-0000000000a1', 'EMP-7301',
   'Sample Central Elementary School', 'Sample Division');
insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('53000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-0000000000b1',
   'LRN-730001', (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('c3000000-0000-4000-8000-000000000001', 'DEL-UNUSED-1',
   (select grade_id from app.grade_levels where level = 6),
   'Numbers and Number Sense', 'Unused draft competency', 'draft'),
  ('c3000000-0000-4000-8000-000000000002', 'DEL-INUSE-1',
   (select grade_id from app.grade_levels where level = 6),
   'Geometry', 'Competency holding a learner record', 'archived');

-- The evidence that must protect the second one.
insert into app.competency_progress (student_id, competency_id, attempt_count) values
  ('53000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', 1);

-- ---------------------------------------------------------------------------
-- The grant and the policy
-- ---------------------------------------------------------------------------
select ok(
  has_table_privilege('authenticated', 'app.competencies'::regclass, 'delete'),
  'authenticated may attempt a delete at all'
);

select ok(
  not has_table_privilege('anon', 'app.competencies'::regclass, 'delete'),
  'anon may not'
);

select is(
  (select count(*)
   from pg_policy
   join pg_class on pg_class.oid = pg_policy.polrelid
   where pg_class.relname = 'competencies'
     and pg_policy.polname = 'competencies_delete'
     and pg_policy.polcmd = 'd'),
  1::bigint,
  'the delete policy exists and governs deletes only'
);

-- ---------------------------------------------------------------------------
-- A learner is refused, whatever state the competency is in
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"b3000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

-- A denial by USING removes the row from view rather than raising, so the
-- proof is that nothing was affected — not that an error was thrown.
select lives_ok(
  $$ delete from app.competencies where code = 'DEL-UNUSED-1' $$,
  'a learner''s delete runs'
);

reset role;
set local request.jwt.claims = '';

select is(
  (select count(*) from app.competencies where code = 'DEL-UNUSED-1'),
  1::bigint,
  'but removes nothing: a learner may never delete a competency'
);

-- ---------------------------------------------------------------------------
-- A Teacher/Administrator, and a competency nothing points at
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a3000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is(
  (select count(*) from app.competencies where code = 'DEL-UNUSED-1'),
  1::bigint,
  'a Teacher/Administrator can see a draft, which is what makes the rest meaningful'
);

-- Draft is not a state a competency may be removed from: archive first, so a
-- destructive step always follows a reversible one.
select lives_ok(
  $$ delete from app.competencies where code = 'DEL-UNUSED-1' $$,
  'deleting a draft runs'
);

select is(
  (select count(*) from app.competencies where code = 'DEL-UNUSED-1'),
  1::bigint,
  'but removes nothing: a draft is out of scope for deletion'
);

-- Archive it, which is what the interface makes you do first.
update app.competencies set status = 'archived' where code = 'DEL-UNUSED-1';

select lives_ok(
  $$ delete from app.competencies where code = 'DEL-UNUSED-1' $$,
  'deleting an archived, unreferenced competency runs'
);

select is(
  (select count(*) from app.competencies where code = 'DEL-UNUSED-1'),
  0::bigint,
  'and removes it'
);

-- ---------------------------------------------------------------------------
-- A competency carrying learner evidence cannot go, however it is asked
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ delete from app.competencies where code = 'DEL-INUSE-1' $$,
  '23503',
  null::text,
  'a competency holding a learner''s progress is refused by the foreign key'
);

select is(
  (select count(*) from app.competencies where code = 'DEL-INUSE-1'),
  1::bigint,
  'and is still there'
);

select is(
  (select count(*) from app.competency_progress
   where competency_id = 'c3000000-0000-4000-8000-000000000002'),
  1::bigint,
  'along with the learner record that protected it'
);

select is(
  (select status::text from app.competencies where code = 'DEL-INUSE-1'),
  'archived',
  'and the refused delete changed nothing about the row'
);

reset role;
select * from finish();
rollback;
