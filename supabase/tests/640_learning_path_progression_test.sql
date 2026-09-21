-- MathSmart Phase 7 — the learning path advances, and a locked item refuses.
--
-- Until this migration the path was written once, by the diagnostic, and never
-- again: finishing the first module opened nothing, no item ever became
-- `completed` from study, `in_progress` could not occur at all, and `locked`
-- was a word on a card rather than a rule anything enforced.
--
-- These tests hold the four things that has to mean. The transitions happen in
-- the documented order; running the refresh again changes nothing; one
-- learner's path cannot move another's; and a locked item refuses the write
-- whether it arrives through the learner's own function or straight through
-- SQL, because the guard is a trigger rather than a line in a route.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Shape and hardening
-- ---------------------------------------------------------------------------
select has_function('app'::name, 'refresh_learning_path'::name,
                    'app.refresh_learning_path exists');
select has_function('app'::name, 'module_is_locked_for'::name,
                    'app.module_is_locked_for exists');

select ok(
  (select bool_and(pg_proc.prosecdef)
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.proname in ('refresh_learning_path', 'module_is_locked_for',
                             'enforce_module_progress_unlocked',
                             'enforce_activity_attempt_unlocked')),
  'The progression functions are SECURITY DEFINER, because a learner may not write the path'
);

select ok(
  (select bool_and(pg_proc.proconfig::text like '%search_path%')
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.proname in ('refresh_learning_path', 'module_is_locked_for',
                             'enforce_module_progress_unlocked',
                             'enforce_activity_attempt_unlocked')),
  'The progression functions pin their search_path'
);

-- Recomputing somebody's path is not something a learner asks for directly.
select ok(
  not has_function_privilege('authenticated', 'app.refresh_learning_path(uuid)', 'execute'),
  'authenticated cannot execute app.refresh_learning_path'
);
select ok(
  not has_function_privilege('anon', 'app.refresh_learning_path(uuid)', 'execute'),
  'anon cannot execute app.refresh_learning_path'
);

select has_trigger('app'::name, 'student_module_progress'::name,
                   'student_module_progress_requires_an_open_path_item'::name,
                   'Module progress is guarded by the locked-item trigger');
select has_trigger('app'::name, 'activity_attempts'::name,
                   'activity_attempts_require_an_open_path_item'::name,
                   'Activity attempts are guarded by the locked-item trigger');

-- ---------------------------------------------------------------------------
-- Fixture: two learners, three published competencies, one module each.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('b8000000-0000-4000-8000-0000000000b1', 'path.one@mathsmart.test'),
  ('b8000000-0000-4000-8000-0000000000b2', 'path.two@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('b8000000-0000-4000-8000-0000000000b1', 'Path Learner One',
   'path.one@mathsmart.test', 'student'),
  ('b8000000-0000-4000-8000-0000000000b2', 'Path Learner Two',
   'path.two@mathsmart.test', 'student');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('58000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-0000000000b1',
   'LRN-800001', (select grade_id from app.grade_levels where level = 6)),
  ('58000000-0000-4000-8000-000000000002', 'b8000000-0000-4000-8000-0000000000b2',
   'LRN-800002', (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status)
select
  ('c8000000-0000-4000-8000-00000000000' || n)::uuid,
  'PATH-COMP-' || n,
  (select grade_id from app.grade_levels where level = 6),
  'Number Sense',
  'Path competency ' || n,
  'published'
from generate_series(1, 3) as n;

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective,
   short_explanation, rules, worked_examples, status, order_index)
select
  ('d8000000-0000-4000-8000-00000000000' || n)::uuid,
  ('c8000000-0000-4000-8000-00000000000' || n)::uuid,
  'Path module ' || n, 15, 'Apply the rule.', 'A short explanation.',
  '[{"title": "The rule"}]'::jsonb,
  '[{"problem": "2 + 2"}]'::jsonb,
  'published', n
from generate_series(1, 3) as n;

-- ---------------------------------------------------------------------------
-- Creating the path settles the opening statuses
-- ---------------------------------------------------------------------------
-- Inserted deliberately as `locked` across the board, the way a rebuild that
-- knew nothing about progress would leave them. The statement trigger is what
-- has to sort them out.
insert into app.learning_path_items
  (student_id, competency_id, module_id, priority, reason, status)
select
  '58000000-0000-4000-8000-000000000001',
  ('c8000000-0000-4000-8000-00000000000' || n)::uuid,
  ('d8000000-0000-4000-8000-00000000000' || n)::uuid,
  n, 'Fixture', 'locked'
from generate_series(1, 3) as n;

insert into app.learning_path_items
  (student_id, competency_id, module_id, priority, reason, status)
select
  '58000000-0000-4000-8000-000000000002',
  ('c8000000-0000-4000-8000-00000000000' || n)::uuid,
  ('d8000000-0000-4000-8000-00000000000' || n)::uuid,
  n, 'Fixture', 'locked'
from generate_series(1, 3) as n;

create or replace function pg_temp.path_status(p_student uuid, p_priority integer)
returns text
language sql
stable
as $$
  select learning_path_items.status::text
  from app.learning_path_items
  where learning_path_items.student_id = p_student
    and learning_path_items.priority = p_priority;
$$;

select is(pg_temp.path_status('58000000-0000-4000-8000-000000000001', 1), 'available',
          'The first item opens as soon as the path exists');
select is(pg_temp.path_status('58000000-0000-4000-8000-000000000001', 2), 'locked',
          'The second item waits for the first');
select is(pg_temp.path_status('58000000-0000-4000-8000-000000000001', 3), 'locked',
          'Later items stay locked');

-- ---------------------------------------------------------------------------
-- Idempotency: running it again changes nothing at all
-- ---------------------------------------------------------------------------
create temporary table path_before on commit drop as
select path_item_id, status, updated_at
from app.learning_path_items
where learning_path_items.student_id = '58000000-0000-4000-8000-000000000001';

select app.refresh_learning_path('58000000-0000-4000-8000-000000000001');
select app.refresh_learning_path('58000000-0000-4000-8000-000000000001');

select is_empty(
  $$
    select path_before.path_item_id
    from path_before
    join app.learning_path_items as after
      on after.path_item_id = path_before.path_item_id
    where after.status is distinct from path_before.status
       or after.updated_at is distinct from path_before.updated_at
  $$,
  'Refreshing an already-settled path rewrites nothing, not even updated_at'
);

-- A learner who does not exist is not an error.
select lives_ok(
  $$ select app.refresh_learning_path('58000000-0000-4000-8000-0000000000ff') $$,
  'Refreshing an unknown learner is a no-op rather than a failure'
);
select lives_ok(
  $$ select app.refresh_learning_path(null) $$,
  'Refreshing a null learner is a no-op rather than a failure'
);

-- ---------------------------------------------------------------------------
-- A locked item refuses the write
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"b8000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select throws_ok(
  $$ select app.save_module_progress('d8000000-0000-4000-8000-000000000003', array['objective']) $$,
  '55000',
  'This lesson opens once the earlier lessons in your path are finished',
  'A learner cannot record progress against a locked module, whatever the interface showed them'
);

select is(
  (select count(*) from app.student_module_progress
   where student_module_progress.module_id = 'd8000000-0000-4000-8000-000000000003'),
  0::bigint,
  'The refused write left no row behind'
);

-- ---------------------------------------------------------------------------
-- Progress begins: available becomes in_progress, and nothing else moves
-- ---------------------------------------------------------------------------
select is(
  (select save.completion_percentage
   from app.save_module_progress(
     'd8000000-0000-4000-8000-000000000001', array['objective']
   ) as save),
  25.00::numeric(5,2),
  'One section of four is twenty-five percent'
);

select is(pg_temp.path_status('58000000-0000-4000-8000-000000000001', 1), 'in_progress',
          'Starting the first module marks the item in progress');
select is(pg_temp.path_status('58000000-0000-4000-8000-000000000001', 2), 'locked',
          'Starting a module does not open the next one');

-- ---------------------------------------------------------------------------
-- Completion: the item closes and exactly one more opens
-- ---------------------------------------------------------------------------
select is(
  (select save.is_complete
   from app.save_module_progress(
     'd8000000-0000-4000-8000-000000000001',
     array['objective', 'concept', 'rule_1', 'example_1']
   ) as save),
  true,
  'Every section finished completes the module'
);

select is(pg_temp.path_status('58000000-0000-4000-8000-000000000001', 1), 'completed',
          'Finishing the module completes its path item');
select is(pg_temp.path_status('58000000-0000-4000-8000-000000000001', 2), 'available',
          'The next item opens, and only the next one');
select is(pg_temp.path_status('58000000-0000-4000-8000-000000000001', 3), 'locked',
          'The item after that stays locked');

-- The module that was refused a moment ago is still refused.
select throws_ok(
  $$ select app.save_module_progress('d8000000-0000-4000-8000-000000000003', array['objective']) $$,
  '55000',
  'This lesson opens once the earlier lessons in your path are finished',
  'Opening one item does not open the rest of the path'
);

-- ---------------------------------------------------------------------------
-- One learner's progress does not move another's path
-- ---------------------------------------------------------------------------
-- Read as the owner rather than as learner one: `learning_path_items` is under
-- Row Level Security, so learner one cannot see these rows at all — which is
-- itself correct, and would make the isolation check pass for the wrong reason.
reset role;

select is(pg_temp.path_status('58000000-0000-4000-8000-000000000002', 1), 'available',
          'The other learner is still at the start');
select is(pg_temp.path_status('58000000-0000-4000-8000-000000000002', 2), 'locked',
          'The other learner''s second item did not open');
select is(
  (select count(*) from app.student_module_progress
   where student_module_progress.student_id = '58000000-0000-4000-8000-000000000002'),
  0::bigint,
  'The other learner has no progress rows'
);

-- ---------------------------------------------------------------------------
-- A completed item is never downgraded
-- ---------------------------------------------------------------------------
-- A teacher adding a worked example lengthens the module, so the stored
-- percentage falls below the new total and `is_complete` goes false. The
-- learner did the work that was asked of them at the time; the path must not
-- take it back.
reset role;

update app.learning_modules
   set worked_examples = '[{"problem": "2 + 2"}, {"problem": "3 + 3"}]'::jsonb
 where learning_modules.module_id = 'd8000000-0000-4000-8000-000000000001';

set local request.jwt.claims = '{"sub":"b8000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(
  (select save.is_complete
   from app.save_module_progress(
     'd8000000-0000-4000-8000-000000000001',
     array['objective', 'concept', 'rule_1', 'example_1']
   ) as save),
  false,
  'A lengthened module is no longer complete on the progress row'
);

select is(pg_temp.path_status('58000000-0000-4000-8000-000000000001', 1), 'completed',
          'The path item stays completed even so');
select is(pg_temp.path_status('58000000-0000-4000-8000-000000000001', 2), 'available',
          'And the item it opened stays open');

-- ---------------------------------------------------------------------------
-- The activity guard holds against direct SQL, not only against the route
-- ---------------------------------------------------------------------------
reset role;

insert into app.activities
  (activity_id, module_id, title, description, estimated_minutes, points,
   mastery_threshold, status, version)
values (
  'e8000000-0000-4000-8000-000000000003',
  'd8000000-0000-4000-8000-000000000003',
  'Locked practice', 'Try these.', 10, 10, 75, 'published', 1
);

select throws_ok(
  $$
    insert into app.activity_attempts
      (student_id, activity_id, attempt_number, activity_version)
    values ('58000000-0000-4000-8000-000000000001',
            'e8000000-0000-4000-8000-000000000003', 1, 1)
  $$,
  '55000',
  'This practice opens once the earlier lessons in your path are finished',
  'An attempt at a locked module''s practice is refused even straight through SQL'
);

-- An activity on an open module is not refused.
insert into app.activities
  (activity_id, module_id, title, description, estimated_minutes, points,
   mastery_threshold, status, version)
values (
  'e8000000-0000-4000-8000-000000000002',
  'd8000000-0000-4000-8000-000000000002',
  'Open practice', 'Try these.', 10, 10, 75, 'published', 1
);

select lives_ok(
  $$
    insert into app.activity_attempts
      (student_id, activity_id, attempt_number, activity_version)
    values ('58000000-0000-4000-8000-000000000001',
            'e8000000-0000-4000-8000-000000000002', 1, 1)
  $$,
  'An attempt at the open item''s practice is allowed'
);

-- ---------------------------------------------------------------------------
-- A module outside the path is not locked, it is simply not prescribed
-- ---------------------------------------------------------------------------
insert into app.competencies (competency_id, code, grade_id, domain, name, status)
values ('c8000000-0000-4000-8000-000000000009', 'PATH-COMP-9',
        (select grade_id from app.grade_levels where level = 6),
        'Number Sense', 'Unprescribed competency', 'published');

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective,
   short_explanation, rules, worked_examples, status, order_index)
values ('d8000000-0000-4000-8000-000000000009',
        'c8000000-0000-4000-8000-000000000009',
        'Unprescribed module', 15, 'Apply the rule.', 'A short explanation.',
        '[{"title": "The rule"}]'::jsonb, '[{"problem": "2 + 2"}]'::jsonb,
        'published', 9);

set local request.jwt.claims = '{"sub":"b8000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select lives_ok(
  $$ select app.save_module_progress('d8000000-0000-4000-8000-000000000009', array['objective']) $$,
  'Studying a published module the path never mentioned is still allowed'
);

-- Asked as the owner: the helper is revoked from every role on purpose, so a
-- learner cannot interrogate somebody else's path one module at a time.
reset role;

select ok(
  not app.module_is_locked_for('58000000-0000-4000-8000-000000000001',
                               'd8000000-0000-4000-8000-000000000009'),
  'A module with no path item reports as not locked'
);
select ok(
  app.module_is_locked_for('58000000-0000-4000-8000-000000000001',
                           'd8000000-0000-4000-8000-000000000003'),
  'A module whose path item is locked reports as locked'
);

select * from finish();
rollback;
