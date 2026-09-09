-- MathSmart Phase 2 — learning-content relationships and constraints.
--
-- Proves the curriculum shapes MathSmart must support and the ones it must
-- reject. Runs as the migration owner, so RLS is not the subject here.
--
-- No DepEd competency code or learning material is invented as production
-- content: every value below is an obvious test fixture, rolled back with the
-- surrounding transaction.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('c1000000-0000-4000-8000-000000000001', 'TEST-COMP-1',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Test competency one', 'published'),
  ('c1000000-0000-4000-8000-000000000002', 'TEST-COMP-2',
   (select grade_id from app.grade_levels where level = 6),
   'Geometry', 'Test competency two', 'draft');

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective, short_explanation, status, order_index)
values
  ('d1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
   'Test module one', 20, 'Objective one', 'Explanation one', 'published', 1),
  ('d1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001',
   'Test module two', 25, 'Objective two', 'Explanation two', 'draft', 2);

insert into app.questions
  (question_id, competency_id, question_type, difficulty, prompt, choices, answer_key, explanation, hint, status)
values
  ('e1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
   'multiple_choice', 'easy', 'Test prompt one', '["1","2","3","4"]'::jsonb, '{"choice":"2"}'::jsonb,
   'Test explanation one', 'Test hint one', 'published'),
  ('e1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001',
   'number_input', 'medium', 'Test prompt two', '[]'::jsonb, '{"value":42}'::jsonb,
   null, null, 'published'),
  ('e1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001',
   'fill_blank', 'hard', 'Test prompt three', '[]'::jsonb, '{"text":"three"}'::jsonb,
   null, null, 'draft');

insert into app.assessments
  (assessment_id, grade_id, title, assessment_type, status, duration_minutes)
values
  ('f1000000-0000-4000-8000-000000000001',
   (select grade_id from app.grade_levels where level = 6),
   'Test diagnostic', 'diagnostic', 'published', 45);

insert into app.activities
  (activity_id, module_id, title, estimated_minutes, points, mastery_threshold, status)
values
  ('a1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
   'Test activity one', 15, 10, 75, 'published');

-- ---------------------------------------------------------------------------
-- The canonical relationships hold
-- ---------------------------------------------------------------------------
select is(
  (select grade_levels.level
   from app.competencies
   join app.grade_levels on grade_levels.grade_id = competencies.grade_id
   where competencies.code = 'TEST-COMP-1'),
  6,
  'A competency belongs to a grade level'
);

select is(
  (select count(*) from app.learning_modules
   where learning_modules.competency_id = 'c1000000-0000-4000-8000-000000000001'),
  2::bigint,
  'A competency can carry ordered learning modules'
);

select is(
  (select count(*) from app.activities
   where activities.module_id = 'd1000000-0000-4000-8000-000000000001'),
  1::bigint,
  'A learning module can carry one or more activities'
);

select is(
  (select competencies.code
   from app.questions
   join app.competencies on competencies.competency_id = questions.competency_id
   where questions.question_id = 'e1000000-0000-4000-8000-000000000001'),
  'TEST-COMP-1',
  'A question belongs to a competency'
);

-- ---------------------------------------------------------------------------
-- Ordered membership
-- ---------------------------------------------------------------------------
insert into app.assessment_questions (assessment_id, question_id, position) values
  ('f1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 2),
  ('f1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 1);

select is(
  (select string_agg(questions.prompt, ' | ' order by assessment_questions.position)
   from app.assessment_questions
   join app.questions on questions.question_id = assessment_questions.question_id
   where assessment_questions.assessment_id = 'f1000000-0000-4000-8000-000000000001'),
  'Test prompt one | Test prompt two',
  'Assessment questions are returned in their authored order, not their insert order'
);

insert into app.activity_questions (activity_id, question_id, position) values
  ('a1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 1),
  ('a1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 2);

select is(
  (select string_agg(activity_questions.question_id::text, ',' order by activity_questions.position)
   from app.activity_questions
   where activity_questions.activity_id = 'a1000000-0000-4000-8000-000000000001'),
  'e1000000-0000-4000-8000-000000000001,e1000000-0000-4000-8000-000000000002',
  'Activity questions retain their authored order'
);

select throws_ok(
  $$ insert into app.assessment_questions (assessment_id, question_id, position)
     values ('f1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 3) $$,
  '23505', null::text,
  'The same question cannot be added to an assessment twice'
);

select throws_ok(
  $$ insert into app.assessment_questions (assessment_id, question_id, position)
     values ('f1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 1) $$,
  '23505', null::text,
  'Two assessment questions cannot claim the same position'
);

select throws_ok(
  $$ insert into app.activity_questions (activity_id, question_id, position)
     values ('a1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 3) $$,
  '23505', null::text,
  'The same question cannot be added to an activity twice'
);

select throws_ok(
  $$ insert into app.activity_questions (activity_id, question_id, position)
     values ('a1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 2) $$,
  '23505', null::text,
  'Two activity questions cannot claim the same position'
);

select throws_ok(
  $$ insert into app.assessment_questions (assessment_id, question_id, position)
     values ('f1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 0) $$,
  '23514', null::text,
  'A membership position below one is rejected'
);

-- ---------------------------------------------------------------------------
-- Competency codes and grade scoping
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.competencies (code, grade_id, domain, name)
     values ('TEST-COMP-1', (select grade_id from app.grade_levels where level = 6),
             'Number Sense', 'Duplicate code') $$,
  '23505', null::text,
  'A duplicate competency code is rejected'
);

select throws_ok(
  $$ insert into app.competencies (code, grade_id, domain, name)
     values ('test-comp-3', (select grade_id from app.grade_levels where level = 6),
             'Number Sense', 'Lower case code') $$,
  '23514', null::text,
  'A competency code must be stored normalised in upper case'
);

select throws_ok(
  $$ insert into app.competencies (code, grade_id, domain, name)
     values ('TEST-COMP-4', '00000000-0000-4000-8000-00000000dead', 'Number Sense', 'Ghost grade') $$,
  '23503', null::text,
  'A competency must belong to a real grade level'
);

select throws_ok(
  $$ insert into app.competencies (code, grade_id, domain, name)
     values ('TEST-COMP-5', (select grade_id from app.grade_levels where level = 6), '  ', 'Blank domain') $$,
  '23514', null::text,
  'A blank competency domain is rejected'
);

-- ---------------------------------------------------------------------------
-- Prerequisites
-- ---------------------------------------------------------------------------
update app.competencies
set prerequisite_ids = '["c1000000-0000-4000-8000-000000000002"]'::jsonb
where competency_id = 'c1000000-0000-4000-8000-000000000001';

select is(
  (select jsonb_array_length(prerequisite_ids) from app.competencies
    where competency_id = 'c1000000-0000-4000-8000-000000000001'),
  1,
  'A competency can record a prerequisite'
);

select throws_ok(
  $$ update app.competencies
     set prerequisite_ids = '["c1000000-0000-4000-8000-000000000001"]'::jsonb
     where competency_id = 'c1000000-0000-4000-8000-000000000001' $$,
  '23514', null::text,
  'A competency cannot be its own prerequisite'
);

select throws_ok(
  $$ update app.competencies set prerequisite_ids = '{"a":1}'::jsonb
     where competency_id = 'c1000000-0000-4000-8000-000000000002' $$,
  '23514', null::text,
  'prerequisite_ids must be a JSON array'
);

select throws_ok(
  $$ update app.competencies set prerequisite_ids = '[1, 2]'::jsonb
     where competency_id = 'c1000000-0000-4000-8000-000000000002' $$,
  '23514', null::text,
  'prerequisite_ids must hold competency identifiers as strings'
);

-- ---------------------------------------------------------------------------
-- Module ordering and versioning
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.learning_modules
       (competency_id, title, estimated_minutes, learning_objective, short_explanation, status, order_index)
     values ('c1000000-0000-4000-8000-000000000001', 'Test module three', 20,
             'Objective three', 'Explanation three', 'published', 1) $$,
  '23505', null::text,
  'Two live modules cannot claim the same position within a competency'
);

-- An archived module is out of the learner sequence, so its position may repeat.
insert into app.learning_modules
  (competency_id, title, estimated_minutes, learning_objective, short_explanation, status, order_index)
values ('c1000000-0000-4000-8000-000000000001', 'Test module archived', 20,
        'Objective archived', 'Explanation archived', 'archived', 1);

select is(
  (select count(*) from app.learning_modules
    where learning_modules.competency_id = 'c1000000-0000-4000-8000-000000000001'
      and learning_modules.order_index = 1),
  2::bigint,
  'An archived module may reuse the position of a live one'
);

select throws_ok(
  $$ insert into app.learning_modules
       (competency_id, title, estimated_minutes, learning_objective, short_explanation, order_index)
     values ('c1000000-0000-4000-8000-000000000001', 'Test module one', 20,
             'Objective duplicate', 'Explanation duplicate', 9) $$,
  '23505', null::text,
  'A competency cannot hold two modules with the same title and version'
);

select throws_ok(
  $$ insert into app.learning_modules
       (competency_id, title, estimated_minutes, learning_objective, short_explanation, order_index)
     values ('c1000000-0000-4000-8000-000000000001', 'Zero minutes', 0,
             'Objective', 'Explanation', 10) $$,
  '23514', null::text,
  'A module duration must be positive'
);

select throws_ok(
  $$ insert into app.learning_modules
       (competency_id, title, estimated_minutes, learning_objective, short_explanation, version, order_index)
     values ('c1000000-0000-4000-8000-000000000001', 'Zero version', 20,
             'Objective', 'Explanation', 0, 11) $$,
  '23514', null::text,
  'A module version must be positive'
);

select throws_ok(
  $$ insert into app.learning_modules
       (competency_id, title, estimated_minutes, learning_objective, short_explanation, order_index)
     values ('c1000000-0000-4000-8000-000000000001', 'Negative order', 20,
             'Objective', 'Explanation', -1) $$,
  '23514', null::text,
  'A module position cannot be negative'
);

select throws_ok(
  $$ insert into app.learning_modules
       (competency_id, title, estimated_minutes, learning_objective, short_explanation, order_index)
     values ('00000000-0000-4000-8000-00000000dead', 'Orphan module', 20,
             'Objective', 'Explanation', 12) $$,
  '23503', null::text,
  'A module must belong to a real competency'
);

-- ---------------------------------------------------------------------------
-- Questions
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.questions (competency_id, question_type, prompt, choices, answer_key)
     values ('c1000000-0000-4000-8000-000000000001', 'multiple_choice', 'Too few choices',
             '["only"]'::jsonb, '{"choice":"only"}'::jsonb) $$,
  '23514', null::text,
  'A multiple-choice question needs at least two choices'
);

select throws_ok(
  $$ insert into app.questions (competency_id, question_type, prompt, answer_key)
     values ('c1000000-0000-4000-8000-000000000001', 'number_input', 'Null key', 'null'::jsonb) $$,
  '23514', null::text,
  'A question cannot be stored with an empty answer key'
);

select throws_ok(
  $$ insert into app.questions (competency_id, question_type, prompt, answer_key, status)
     values ('c1000000-0000-4000-8000-000000000001', 'matching', 'Reserved type',
             '{"pairs":[]}'::jsonb, 'published') $$,
  '23514', null::text,
  'A reserved question type cannot be published before its grading support exists'
);

-- Authoring a reserved type as a draft stays allowed, so the contract can grow.
insert into app.questions (competency_id, question_type, prompt, answer_key, status)
values ('c1000000-0000-4000-8000-000000000001', 'ordering', 'Reserved draft',
        '{"order":[1,2]}'::jsonb, 'draft');

select is(
  (select count(*) from app.questions where questions.question_type = 'ordering'),
  1::bigint,
  'A reserved question type may still be authored as a draft'
);

select throws_ok(
  $$ insert into app.questions (competency_id, question_type, prompt, answer_key)
     values ('00000000-0000-4000-8000-00000000dead', 'number_input', 'Orphan question', '{"value":1}'::jsonb) $$,
  '23503', null::text,
  'A question must belong to a real competency'
);

select throws_ok(
  $$ insert into app.questions (competency_id, question_type, prompt, answer_key, version)
     values ('c1000000-0000-4000-8000-000000000001', 'number_input', 'Zero version', '{"value":1}'::jsonb, 0) $$,
  '23514', null::text,
  'A question version must be positive'
);

-- ---------------------------------------------------------------------------
-- Assessments and activities
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.assessments (grade_id, title, assessment_type, duration_minutes)
     values ((select grade_id from app.grade_levels where level = 6), 'Zero duration', 'unit_quiz', 0) $$,
  '23514', null::text,
  'An assessment duration must be positive'
);

select throws_ok(
  $$ insert into app.assessments (grade_id, title, assessment_type, duration_minutes)
     values ('00000000-0000-4000-8000-00000000dead', 'Orphan assessment', 'diagnostic', 30) $$,
  '23503', null::text,
  'An assessment must belong to a real grade level'
);

select throws_ok(
  $$ insert into app.assessments (grade_id, title, assessment_type, duration_minutes, version)
     values ((select grade_id from app.grade_levels where level = 6), 'Test diagnostic', 'diagnostic', 45, 1) $$,
  '23505', null::text,
  'A grade cannot hold two assessments with the same title and version'
);

select throws_ok(
  $$ insert into app.activities (module_id, title, estimated_minutes, points)
     values ('d1000000-0000-4000-8000-000000000001', 'Negative points', 15, -1) $$,
  '23514', null::text,
  'Activity points cannot be negative'
);

select throws_ok(
  $$ insert into app.activities (module_id, title, estimated_minutes, mastery_threshold)
     values ('d1000000-0000-4000-8000-000000000001', 'Zero threshold', 15, 0) $$,
  '23514', null::text,
  'An activity pass threshold below one is rejected'
);

select throws_ok(
  $$ insert into app.activities (module_id, title, estimated_minutes, mastery_threshold)
     values ('d1000000-0000-4000-8000-000000000001', 'Impossible threshold', 15, 101) $$,
  '23514', null::text,
  'An activity pass threshold above one hundred is rejected'
);

select throws_ok(
  $$ insert into app.activities (module_id, title, estimated_minutes)
     values ('00000000-0000-4000-8000-00000000dead', 'Orphan activity', 15) $$,
  '23503', null::text,
  'An activity must belong to a real learning module'
);

select is(
  (select mastery_threshold from app.activities
    where activities.activity_id = 'a1000000-0000-4000-8000-000000000001'),
  75,
  'An activity carries its authored pass threshold'
);

-- ---------------------------------------------------------------------------
-- Retention and cascade behaviour
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ delete from app.questions where questions.question_id = 'e1000000-0000-4000-8000-000000000001' $$,
  '23503', null::text,
  'A question still used by an assessment or activity cannot be deleted'
);

select throws_ok(
  $$ delete from app.competencies where competencies.competency_id = 'c1000000-0000-4000-8000-000000000001' $$,
  '23503', null::text,
  'A competency still carrying modules or questions cannot be deleted'
);

-- Removing an assessment definition cascades to its membership rows only; the
-- reusable question-bank items survive.
delete from app.assessments
where assessments.assessment_id = 'f1000000-0000-4000-8000-000000000001';

select is(
  (select count(*) from app.assessment_questions
    where assessment_questions.assessment_id = 'f1000000-0000-4000-8000-000000000001'),
  0::bigint,
  'Removing an assessment definition removes its ordered membership rows'
);

select is(
  (select count(*) from app.questions where questions.question_id = 'e1000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Removing an assessment leaves the reusable question-bank item intact'
);

-- Archiving is the supported path for authored content.
update app.competencies set status = 'archived'
where competencies.competency_id = 'c1000000-0000-4000-8000-000000000002';

select is(
  (select status from app.competencies
    where competencies.competency_id = 'c1000000-0000-4000-8000-000000000002'),
  'archived'::app.publication_status,
  'A competency can be archived instead of deleted'
);

select * from finish();

rollback;
