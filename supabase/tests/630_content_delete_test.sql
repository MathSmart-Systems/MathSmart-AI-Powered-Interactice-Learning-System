-- MathSmart — removing authored content that was never used.
--
-- Archiving is the right answer for anything that has been taught. This is the
-- other case: a prompt typed wrong, a draft abandoned, a duplicate.
--
-- Two guards, tested apart because they fail for different reasons and protect
-- against different mistakes. The policy decides who may try and from what
-- state. The foreign keys decide whether the row is free to go at all, and they
-- are what stands between a teacher and a child's recorded work.
--
-- The last section is the one that matters most over time: it enumerates every
-- foreign key pointing at the four tables and refuses any that is neither a
-- declared membership cascade nor ON DELETE RESTRICT. A foreign key added later
-- without a matching reference count fails here rather than quietly opening a
-- path through a learner's evidence.

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- ---------------------------------------------------------------------------
-- Fixtures, created as the migration owner
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a5000000-0000-4000-8000-0000000000a1', 'content.adviser@mathsmart.test'),
  ('b5000000-0000-4000-8000-0000000000b1', 'content.learner@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('a5000000-0000-4000-8000-0000000000a1', 'Content Adviser',
   'content.adviser@mathsmart.test', 'teacher_admin'),
  ('b5000000-0000-4000-8000-0000000000b1', 'Content Learner',
   'content.learner@mathsmart.test', 'student');

insert into app.teacher_admin_profiles (user_id, employee_id, school_name, division_name)
values ('a5000000-0000-4000-8000-0000000000a1', 'EMP-7501',
        'Sample Central Elementary School', 'Sample Division');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id)
values ('55000000-0000-4000-8000-000000000001',
        'b5000000-0000-4000-8000-0000000000b1', 'LRN-750001',
        (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status)
values ('c5000000-0000-4000-8000-000000000001', 'DEL-NS-01',
        (select grade_id from app.grade_levels where level = 6),
        'Numbers and Number Sense', 'Removable competency', 'published');

-- An archived module nothing points at, and one carrying an activity.
insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective,
   short_explanation, status, order_index)
values
  ('45000000-0000-4000-8000-000000000001',
   'c5000000-0000-4000-8000-000000000001', 'Unused module', 10,
   'Objective.', 'Explanation.', 'archived', 10),
  ('45000000-0000-4000-8000-000000000002',
   'c5000000-0000-4000-8000-000000000001', 'Module with an activity', 10,
   'Objective.', 'Explanation.', 'archived', 11),
  ('45000000-0000-4000-8000-000000000003',
   'c5000000-0000-4000-8000-000000000001', 'Module a learner studied', 10,
   'Objective.', 'Explanation.', 'archived', 12),
  ('45000000-0000-4000-8000-000000000004',
   'c5000000-0000-4000-8000-000000000001', 'A live module', 10,
   'Objective.', 'Explanation.', 'published', 13);

insert into app.student_module_progress
  (student_id, module_id, completion_percentage, started_at)
values ('55000000-0000-4000-8000-000000000001',
        '45000000-0000-4000-8000-000000000003', 40, now());

insert into app.questions
  (question_id, competency_id, question_type, prompt, answer_key, status)
values
  ('e5000000-0000-4000-8000-000000000001',
   'c5000000-0000-4000-8000-000000000001', 'number_input',
   'Unused question', '"1"'::jsonb, 'archived'),
  ('e5000000-0000-4000-8000-000000000002',
   'c5000000-0000-4000-8000-000000000001', 'number_input',
   'A reusable question', '"2"'::jsonb, 'archived'),
  ('e5000000-0000-4000-8000-000000000003',
   'c5000000-0000-4000-8000-000000000001', 'number_input',
   'A published question', '"3"'::jsonb, 'published');

insert into app.activities
  (activity_id, module_id, title, estimated_minutes, mastery_threshold, status)
values
  ('f5000000-0000-4000-8000-000000000001',
   '45000000-0000-4000-8000-000000000002', 'Unused activity', 10, 75, 'archived'),
  ('f5000000-0000-4000-8000-000000000002',
   '45000000-0000-4000-8000-000000000002', 'Attempted activity', 10, 75, 'archived'),
  ('f5000000-0000-4000-8000-000000000003',
   '45000000-0000-4000-8000-000000000002', 'A live activity', 10, 75, 'published');

-- The unused activity holds the reusable question, which is the whole point of
-- the membership cascade: the activity may go, the question may not go with it.
insert into app.activity_questions (activity_id, question_id, position)
values ('f5000000-0000-4000-8000-000000000001',
        'e5000000-0000-4000-8000-000000000002', 1);

insert into app.activity_attempts
  (attempt_id, student_id, activity_id, attempt_number, activity_version,
   question_snapshot_created_at, question_snapshot_count)
values ('15000000-0000-4000-8000-000000000001',
        '55000000-0000-4000-8000-000000000001',
        'f5000000-0000-4000-8000-000000000002', 1, 1, now(), 1);

insert into app.assessments
  (assessment_id, grade_id, title, assessment_type, duration_minutes, status)
values
  ('a5000000-0000-4000-8000-000000000011',
   (select grade_id from app.grade_levels where level = 6),
   'Unused assessment', 'unit_quiz', 20, 'archived'),
  ('a5000000-0000-4000-8000-000000000012',
   (select grade_id from app.grade_levels where level = 6),
   'Attempted assessment', 'unit_quiz', 20, 'archived'),
  ('a5000000-0000-4000-8000-000000000013',
   (select grade_id from app.grade_levels where level = 6),
   'A live assessment', 'unit_quiz', 20, 'published');

-- The reusable question is seated in two assessments: the unused one, which is
-- about to be removed, and the live one, which keeps holding it afterwards.
-- That is what makes the refusal below about the question rather than about
-- the assessment that happened to be deleted first.
insert into app.assessment_questions (assessment_id, question_id, position)
values
  ('a5000000-0000-4000-8000-000000000011',
   'e5000000-0000-4000-8000-000000000002', 1),
  ('a5000000-0000-4000-8000-000000000013',
   'e5000000-0000-4000-8000-000000000002', 1);

insert into app.assessment_attempts
  (attempt_id, assessment_id, student_id, assessment_version,
   assessment_type_snapshot, question_snapshot_created_at, question_snapshot_count)
values ('25000000-0000-4000-8000-000000000001',
        'a5000000-0000-4000-8000-000000000012',
        '55000000-0000-4000-8000-000000000001', 1, 'unit_quiz', now(), 1);

-- ---------------------------------------------------------------------------
-- The policy: a Teacher/Administrator, and only an archived record
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a5000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select lives_ok(
  $$ delete from app.questions
     where question_id = 'e5000000-0000-4000-8000-000000000001' $$,
  'An archived question nothing points at is removed'
);

select is(
  (select count(*)::integer from app.questions
   where questions.question_id = 'e5000000-0000-4000-8000-000000000001'),
  0,
  'And it is really gone'
);

select lives_ok(
  $$ delete from app.learning_modules
     where module_id = '45000000-0000-4000-8000-000000000001' $$,
  'An archived module nothing points at is removed'
);

select lives_ok(
  $$ delete from app.assessments
     where assessment_id = 'a5000000-0000-4000-8000-000000000011' $$,
  'An archived assessment nobody attempted is removed'
);

select is(
  (select count(*)::integer from app.questions
   where questions.question_id = 'e5000000-0000-4000-8000-000000000002'),
  1,
  'The reusable question it held survives the assessment being removed'
);

select is(
  (select count(*)::integer from app.assessment_questions
   where assessment_questions.assessment_id = 'a5000000-0000-4000-8000-000000000011'),
  0,
  'Its membership rows go with it, because they only said what it held'
);

select lives_ok(
  $$ delete from app.activities
     where activity_id = 'f5000000-0000-4000-8000-000000000001' $$,
  'An archived activity nobody attempted is removed'
);

select is(
  (select count(*)::integer from app.questions
   where questions.question_id = 'e5000000-0000-4000-8000-000000000002'),
  1,
  'The reusable question it held survives the activity being removed too'
);

select is(
  (select count(*)::integer from app.activity_questions
   where activity_questions.activity_id = 'f5000000-0000-4000-8000-000000000001'),
  0,
  'And its membership rows go with it'
);

-- A live record is not in scope for removal at all. The policy filters the
-- row, so the statement affects nothing rather than raising.
select lives_ok(
  $$ delete from app.questions
     where question_id = 'e5000000-0000-4000-8000-000000000003' $$,
  'Deleting a published question raises nothing'
);

select is(
  (select count(*)::integer from app.questions
   where questions.question_id = 'e5000000-0000-4000-8000-000000000003'),
  1,
  'But it removes nothing either: only an archived question is in scope'
);

select is(
  (select count(*)::integer from app.learning_modules
   where learning_modules.module_id = '45000000-0000-4000-8000-000000000004'),
  1,
  'A published module is out of scope in the same way'
);

select is(
  (select count(*)::integer from app.activities
   where activities.activity_id = 'f5000000-0000-4000-8000-000000000003'),
  1,
  'A published activity is out of scope in the same way'
);

select is(
  (select count(*)::integer from app.assessments
   where assessments.assessment_id = 'a5000000-0000-4000-8000-000000000013'),
  1,
  'A published assessment is out of scope in the same way'
);

-- ---------------------------------------------------------------------------
-- The foreign keys: what a learner did is never removed to make room
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ delete from app.activities
     where activity_id = 'f5000000-0000-4000-8000-000000000002' $$,
  '23503',
  NULL,
  'An activity a learner attempted is refused by the database itself'
);

select throws_ok(
  $$ delete from app.assessments
     where assessment_id = 'a5000000-0000-4000-8000-000000000012' $$,
  '23503',
  NULL,
  'An assessment a learner attempted is refused the same way'
);

select throws_ok(
  $$ delete from app.learning_modules
     where module_id = '45000000-0000-4000-8000-000000000003' $$,
  '23503',
  NULL,
  'A module a learner studied is refused by student_module_progress'
);

select throws_ok(
  $$ delete from app.learning_modules
     where module_id = '45000000-0000-4000-8000-000000000002' $$,
  '23503',
  NULL,
  'A module still carrying an activity is refused'
);

select throws_ok(
  $$ delete from app.questions
     where question_id = 'e5000000-0000-4000-8000-000000000002' $$,
  '23503',
  NULL,
  'A question still seated in an assessment is refused'
);

reset role;

-- ---------------------------------------------------------------------------
-- A learner may not remove content at all
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"b5000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select lives_ok(
  $$ delete from app.questions
     where question_id = 'e5000000-0000-4000-8000-000000000002' $$,
  'A learner deleting a question raises nothing'
);

reset role;

-- Counted as the owner rather than as the learner. `questions_select` shows a
-- learner published questions only, so counting under their role would report
-- zero whether or not the row survived, and prove nothing at all.
select is(
  (select count(*)::integer from app.questions
   where questions.question_id = 'e5000000-0000-4000-8000-000000000002'),
  1,
  'But the policy gives them no row to remove'
);

-- ---------------------------------------------------------------------------
-- Every foreign key into the four tables is accounted for
-- ---------------------------------------------------------------------------
-- This is the guard that has to outlive the people who wrote it. A foreign key
-- added later — a new learner record, a new report table — would otherwise
-- either open a silent path through a learner's evidence, or start refusing
-- deletions with a constraint name nobody has taught the API to explain.
--
-- Two shapes are allowed. A membership table cascades, because a row that only
-- says "this set holds that item" has no meaning once the set is gone. Anything
-- else must restrict.
create temporary table allowed_cascades (child text, column_name text) on commit drop;
insert into allowed_cascades values
  ('assessment_questions', 'assessment_id'),
  ('activity_questions', 'activity_id');

select is(
  (select count(*)::integer
   from pg_constraint
   join pg_class as child on child.oid = pg_constraint.conrelid
   join pg_class as parent on parent.oid = pg_constraint.confrelid
   join pg_namespace as parent_schema on parent_schema.oid = parent.relnamespace
   where pg_constraint.contype = 'f'
     and parent_schema.nspname = 'app'
     and parent.relname in ('questions', 'learning_modules', 'activities', 'assessments')
     and pg_constraint.confdeltype <> 'r'
     and not exists (
       select 1 from allowed_cascades
       where allowed_cascades.child = child.relname
         and allowed_cascades.column_name = (
           select attname from pg_attribute
           where attrelid = child.oid
             and attnum = pg_constraint.conkey[1]
         )
     )),
  0,
  'Every foreign key into authored content either restricts or is a declared membership cascade'
);

select is(
  (select count(*)::integer
   from pg_constraint
   join pg_class as child on child.oid = pg_constraint.conrelid
   join pg_class as parent on parent.oid = pg_constraint.confrelid
   join pg_namespace as parent_schema on parent_schema.oid = parent.relnamespace
   where pg_constraint.contype = 'f'
     and parent_schema.nspname = 'app'
     and parent.relname = 'questions'),
  4,
  'app.questions is held by exactly the four the reference count reads'
);

select is(
  (select count(*)::integer
   from pg_constraint
   join pg_class as parent on parent.oid = pg_constraint.confrelid
   join pg_namespace as parent_schema on parent_schema.oid = parent.relnamespace
   where pg_constraint.contype = 'f'
     and parent_schema.nspname = 'app'
     and parent.relname = 'learning_modules'),
  3,
  'app.learning_modules is held by exactly the three the reference count reads'
);

select is(
  (select count(*)::integer
   from pg_constraint
   join pg_class as parent on parent.oid = pg_constraint.confrelid
   join pg_namespace as parent_schema on parent_schema.oid = parent.relnamespace
   where pg_constraint.contype = 'f'
     and parent_schema.nspname = 'app'
     and parent.relname = 'activities'),
  2,
  'app.activities is held by exactly the two the reference count reads'
);

select is(
  (select count(*)::integer
   from pg_constraint
   join pg_class as parent on parent.oid = pg_constraint.confrelid
   join pg_namespace as parent_schema on parent_schema.oid = parent.relnamespace
   where pg_constraint.contype = 'f'
     and parent_schema.nspname = 'app'
     and parent.relname = 'assessments'),
  3,
  'app.assessments is held by exactly the three the reference count reads'
);

-- ---------------------------------------------------------------------------
-- The privileges behind all of it
-- ---------------------------------------------------------------------------
select ok(
  has_table_privilege('authenticated', 'app.questions', 'delete'),
  'authenticated may attempt a question deletion, which the policy then filters'
);

select ok(
  has_table_privilege('authenticated', 'app.learning_modules', 'delete'),
  'and a module deletion'
);

select ok(
  has_table_privilege('authenticated', 'app.activities', 'delete'),
  'and an activity deletion'
);

select ok(
  has_table_privilege('authenticated', 'app.assessments', 'delete'),
  'and an assessment deletion'
);

select * from finish();
rollback;
