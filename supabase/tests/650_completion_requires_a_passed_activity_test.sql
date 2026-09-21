-- MathSmart Phase 7b — reading a lesson is not passing it.
--
-- The path used to close an item as soon as `student_module_progress.is_complete`
-- was true, and that column is computed from section identifiers the learner's
-- own browser submits. Ticking four boxes without reading a word unlocked the
-- whole path, and nothing in the system could tell that apart from a child who
-- had actually learned the lesson.
--
-- These tests hold the new rule: a module with a published activity closes only
-- when the learner has passed it, a module without one still closes on reading,
-- and an item already recorded `completed` is never taken back.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Shape and hardening
-- ---------------------------------------------------------------------------
select has_function('app'::name, 'module_is_satisfied'::name,
                    'app.module_is_satisfied exists');
select has_function('app'::name, 'module_activity_passed'::name,
                    'app.module_activity_passed exists');
select has_function('app'::name, 'module_has_required_activity'::name,
                    'app.module_has_required_activity exists');

select ok(
  (select bool_and(pg_proc.prosecdef)
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.proname in ('module_is_satisfied', 'module_activity_passed',
                             'module_has_required_activity')),
  'The completion rules are SECURITY DEFINER, because a learner may not write the path'
);

select ok(
  not has_function_privilege('authenticated', 'app.module_is_satisfied(uuid, uuid)', 'execute'),
  'authenticated cannot ask app.module_is_satisfied about anybody'
);

-- ---------------------------------------------------------------------------
-- Fixture: one learner, two competencies, two modules. The first module has a
-- published activity to pass; the second has none.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('b7000000-0000-4000-8000-0000000000b1', 'pass.one@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('b7000000-0000-4000-8000-0000000000b1', 'Pass Learner',
   'pass.one@mathsmart.test', 'student');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('57000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-0000000000b1',
   'LRN-700001', (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status)
select ('c7000000-0000-4000-8000-00000000000' || n)::uuid,
       'PASS-COMP-' || n,
       (select grade_id from app.grade_levels where level = 6),
       'Number Sense', 'Pass competency ' || n, 'published'
from generate_series(1, 2) as n;

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective,
   short_explanation, rules, worked_examples, status, order_index)
select ('d7000000-0000-4000-8000-00000000000' || n)::uuid,
       ('c7000000-0000-4000-8000-00000000000' || n)::uuid,
       'Pass module ' || n, 15, 'Apply the rule.', 'A short explanation.',
       '[{"title": "The rule"}]'::jsonb, '[{"problem": "2 + 2"}]'::jsonb,
       'published', n
from generate_series(1, 2) as n;

-- Only the first module has practice to pass.
insert into app.activities
  (activity_id, module_id, title, description, estimated_minutes, points,
   mastery_threshold, status, version)
values ('e7000000-0000-4000-8000-000000000001',
        'd7000000-0000-4000-8000-000000000001',
        'Pass practice', 'Try these.', 10, 10, 75, 'published', 1);

insert into app.learning_path_items
  (student_id, competency_id, module_id, priority, reason, status)
select '57000000-0000-4000-8000-000000000001',
       ('c7000000-0000-4000-8000-00000000000' || n)::uuid,
       ('d7000000-0000-4000-8000-00000000000' || n)::uuid,
       n, 'Fixture', 'locked'
from generate_series(1, 2) as n;

create or replace function pg_temp.status_at(p_priority integer)
returns text
language sql
stable
as $$
  select learning_path_items.status::text
  from app.learning_path_items
  where learning_path_items.student_id = '57000000-0000-4000-8000-000000000001'
    and learning_path_items.priority = p_priority;
$$;

select is(pg_temp.status_at(1), 'available', 'The first item opens with the path');
select is(pg_temp.status_at(2), 'locked', 'The second waits for it');

-- ---------------------------------------------------------------------------
-- Reading the whole lesson is no longer enough
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"b7000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select save.is_complete
   from app.save_module_progress(
     'd7000000-0000-4000-8000-000000000001',
     array['objective', 'concept', 'rule_1', 'example_1']
   ) as save),
  true,
  'Every section of the first module is recorded as read'
);

select is(pg_temp.status_at(1), 'in_progress',
          'Reading the lesson moves it forward, but does not close it');
select is(pg_temp.status_at(2), 'locked',
          'And it does not open the next item: reading is not passing');

-- This is the whole point. Before, the two assertions above both read
-- 'completed' and 'available'.
--
-- Asked as the owner: the rule is revoked from every role on purpose, so a
-- learner cannot interrogate somebody else's standing one module at a time.
reset role;

select ok(
  not app.module_is_satisfied('57000000-0000-4000-8000-000000000001',
                              'd7000000-0000-4000-8000-000000000001'),
  'A module with practice is not satisfied by reading it'
);

-- ---------------------------------------------------------------------------
-- Passing the activity is what closes it
-- ---------------------------------------------------------------------------
reset role;

insert into app.activity_attempts
  (attempt_id, student_id, activity_id, attempt_number, activity_version,
   status, score_percentage, passed, mastery_status, submitted_at)
values ('17000000-0000-4000-8000-000000000001',
        '57000000-0000-4000-8000-000000000001',
        'e7000000-0000-4000-8000-000000000001', 1, 1,
        'scored', 40, false, 'Needs Improvement', now());

select is(pg_temp.status_at(1), 'in_progress',
          'A failed attempt does not close the item either');
select is(pg_temp.status_at(2), 'locked', 'Nor open the next one');

update app.activity_attempts
   set passed = true, score_percentage = 90
 where activity_attempts.attempt_id = '17000000-0000-4000-8000-000000000001';

select is(pg_temp.status_at(1), 'completed',
          'Passing the activity closes the module it belongs to');
select is(pg_temp.status_at(2), 'available',
          'And opens exactly the next item');

-- ---------------------------------------------------------------------------
-- A later failure does not take a pass away
-- ---------------------------------------------------------------------------
insert into app.activity_attempts
  (attempt_id, student_id, activity_id, attempt_number, activity_version,
   status, score_percentage, passed, mastery_status, submitted_at)
values ('17000000-0000-4000-8000-000000000002',
        '57000000-0000-4000-8000-000000000001',
        'e7000000-0000-4000-8000-000000000001', 2, 1,
        'scored', 10, false, 'Needs Improvement', now());

select is(pg_temp.status_at(1), 'completed',
          'A learner who has shown the skill keeps the credit for it');

-- ---------------------------------------------------------------------------
-- A module with no activity still closes on reading
-- ---------------------------------------------------------------------------
-- Otherwise a lesson the curriculum gave no way to prove would strand the
-- learner on it for ever.
set local request.jwt.claims = '{"sub":"b7000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select save.is_complete
   from app.save_module_progress(
     'd7000000-0000-4000-8000-000000000002',
     array['objective', 'concept', 'rule_1', 'example_1']
   ) as save),
  true,
  'The second module is read through'
);

reset role;

select ok(
  app.module_is_satisfied('57000000-0000-4000-8000-000000000001',
                          'd7000000-0000-4000-8000-000000000002'),
  'A module with no practice to pass is satisfied by reading it'
);
select is(pg_temp.status_at(2), 'completed',
          'So its path item closes');

-- ---------------------------------------------------------------------------
-- An item already recorded completed is never taken back
-- ---------------------------------------------------------------------------
-- This is what protects a teacher's decision, and anything recorded before
-- this rule arrived, from being undone by it.
insert into app.activities
  (activity_id, module_id, title, description, estimated_minutes, points,
   mastery_threshold, status, version)
values ('e7000000-0000-4000-8000-000000000002',
        'd7000000-0000-4000-8000-000000000002',
        'Late practice', 'Added afterwards.', 10, 10, 75, 'published', 1);

select app.refresh_learning_path('57000000-0000-4000-8000-000000000001');

select is(pg_temp.status_at(2), 'completed',
          'Adding practice to a finished module does not reopen it');

-- ---------------------------------------------------------------------------
-- Idempotency
-- ---------------------------------------------------------------------------
create temporary table settled_before on commit drop as
select path_item_id, status, updated_at
from app.learning_path_items
where learning_path_items.student_id = '57000000-0000-4000-8000-000000000001';

select app.refresh_learning_path('57000000-0000-4000-8000-000000000001');
select app.refresh_learning_path('57000000-0000-4000-8000-000000000001');

select is_empty(
  $$
    select settled_before.path_item_id
    from settled_before
    join app.learning_path_items as after
      on after.path_item_id = settled_before.path_item_id
    where after.status is distinct from settled_before.status
       or after.updated_at is distinct from settled_before.updated_at
  $$,
  'Recomputing a settled path under the new rule still writes nothing'
);

-- ---------------------------------------------------------------------------
-- One learner's pass does not move another's path
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('b7000000-0000-4000-8000-0000000000b2', 'pass.two@mathsmart.test');
insert into app.user_profiles (user_id, full_name, email, role) values
  ('b7000000-0000-4000-8000-0000000000b2', 'Other Learner',
   'pass.two@mathsmart.test', 'student');
insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('57000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-0000000000b2',
   'LRN-700002', (select grade_id from app.grade_levels where level = 6));

insert into app.learning_path_items
  (student_id, competency_id, module_id, priority, reason, status)
select '57000000-0000-4000-8000-000000000002',
       ('c7000000-0000-4000-8000-00000000000' || n)::uuid,
       ('d7000000-0000-4000-8000-00000000000' || n)::uuid,
       n, 'Fixture', 'locked'
from generate_series(1, 2) as n;

select is(
  (select learning_path_items.status::text from app.learning_path_items
   where learning_path_items.student_id = '57000000-0000-4000-8000-000000000002'
     and learning_path_items.priority = 1),
  'available',
  'The other learner starts at the beginning'
);
select is(
  (select learning_path_items.status::text from app.learning_path_items
   where learning_path_items.student_id = '57000000-0000-4000-8000-000000000002'
     and learning_path_items.priority = 2),
  'locked',
  'And the first learner''s pass did not open anything of theirs'
);

select * from finish();
rollback;
