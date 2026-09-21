-- MathSmart Phase 7 — making the learning path move.
--
-- Why this migration exists
-- -------------------------
-- `app.learning_path_items` was written in exactly one place: the diagnostic
-- branch of `app.submit_assessment_attempt`, which deletes the learner's path
-- and rebuilds it, ranking competencies weakest-first and assigning a status
-- once — `completed` where the module was already finished, `available` for
-- priority 1, `locked` for everything else.
--
-- Nothing ever wrote that column again. Three consequences followed, and all
-- three were visible to a learner:
--
--  * Finishing the priority 1 module did not open priority 2. The path a
--    learner was told to follow could not advance, so every learner saw the
--    same single open item until they sat the diagnostic again.
--  * A path item never became `completed` from ordinary study. Only a module
--    that happened to be finished *before* the diagnostic ever carried that
--    status.
--  * `in_progress` exists in `app.path_item_status`, in the learner interface
--    and in its tests, and could never occur, because no code path assigned
--    it.
--
-- And `locked` was a label rather than a rule. `path_status` is selected for
-- display by the learning-modules and activities repositories and is checked
-- by no read or write path anywhere, so a learner who typed the URL of a
-- locked module could open it, record progress against it and complete it.
-- The interface dimmed the control; the database did not care.
--
-- What this migration adds
-- ------------------------
-- One deterministic, idempotent, student-scoped function —
-- `app.refresh_learning_path` — and the triggers that call it from every
-- transition that can change the answer. The rules it applies are the ones the
-- documented workflow already states, not new ones:
--
--   completed    the learner's progress row for that module says is_complete,
--                or the item is already completed (a completed item is never
--                downgraded, even if a teacher later adds a section to the
--                module and the percentage falls back below 100)
--   locked       some earlier item in the path is not complete
--   in_progress  every earlier item is complete and real progress has begun
--   available    every earlier item is complete and nothing is recorded yet
--
-- "Earlier" means lower `priority`, which is the order the diagnostic assigned
-- and which this function never changes. Priority belongs to the diagnostic;
-- status belongs here.
--
-- Enforcement is placed in triggers rather than inside the write functions on
-- purpose. The three functions that would otherwise have to be re-emitted —
-- `start_activity_attempt`, `submit_activity_attempt`,
-- `submit_assessment_attempt` — are large graders holding the snapshot and
-- scoring rules, and replacing them wholesale to insert four lines of guard is
-- a poor trade. A trigger also covers the paths a function guard cannot: a
-- direct Data API call, a future route nobody has written yet, and psql.
--
-- The guard refuses only an item that is actually `locked`. A module with no
-- path item at all is left alone, because browsing published lessons outside
-- the assigned path is an accepted feature of My Learning, and a learner who
-- studies ahead is not doing anything the workflow forbids.

-- ---------------------------------------------------------------------------
-- app.refresh_learning_path
-- ---------------------------------------------------------------------------
-- Recomputes one learner's path item statuses from stored evidence.
--
-- Idempotent twice over: the calculation reads only committed progress rows,
-- and the UPDATE writes only rows whose status actually changes, so running it
-- twice in a transaction touches nothing the second time and leaves `updated_at`
-- alone. Scoped to one learner by parameter, so it can never reach across the
-- cohort. Transactional by construction: it is a single statement inside
-- whatever transaction the caller already opened.
create or replace function app.refresh_learning_path(p_student_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_student_id is null then
    return;
  end if;

  with ordered as (
    select
      items.path_item_id,
      items.priority,
      -- A module the learner has finished, or an item already recorded as
      -- finished. The second half is what stops a completed item sliding
      -- backwards when a teacher adds a rule or a worked example and the
      -- stored percentage drops below the new total.
      coalesce(progress.is_complete, false)
        or items.status = 'completed'::app.path_item_status as settled,
      -- Progress has genuinely begun only when a recognised section was
      -- ticked. A progress row can exist at zero percent — saving nothing
      -- creates one — and that is not study.
      coalesce(progress.completion_percentage, 0) > 0 as started
    from app.learning_path_items as items
    left join app.student_module_progress as progress
      on progress.student_id = items.student_id
     and progress.module_id = items.module_id
    where items.student_id = p_student_id
  ),
  resolved as (
    select
      ordered.path_item_id,
      case
        when ordered.settled then 'completed'::app.path_item_status
        when exists (
          select 1
          from ordered as earlier
          where earlier.priority < ordered.priority
            and not earlier.settled
        ) then 'locked'::app.path_item_status
        when ordered.started then 'in_progress'::app.path_item_status
        else 'available'::app.path_item_status
      end as next_status
    from ordered
  )
  update app.learning_path_items as items
     set status = resolved.next_status
    from resolved
   where items.path_item_id = resolved.path_item_id
     and items.status is distinct from resolved.next_status;
end;
$$;

comment on function app.refresh_learning_path(uuid) is
  'Recomputes one learner''s learning-path item statuses from stored module progress. Deterministic, idempotent, and never reorders or downgrades a completed item.';

-- ---------------------------------------------------------------------------
-- app.module_is_locked_for
-- ---------------------------------------------------------------------------
-- Whether this learner's path says this module is not open yet.
--
-- False when no path item exists: a module outside the assigned path is not
-- locked, it is simply not prescribed.
create or replace function app.module_is_locked_for(p_student_id uuid, p_module_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.learning_path_items
    where learning_path_items.student_id = p_student_id
      and learning_path_items.module_id = p_module_id
      and learning_path_items.status = 'locked'::app.path_item_status
  );
$$;

comment on function app.module_is_locked_for(uuid, uuid) is
  'True when the learner has a learning-path item for this module and that item is still locked.';

-- ---------------------------------------------------------------------------
-- Enforcement — module progress
-- ---------------------------------------------------------------------------
-- 55000 is object_not_in_prerequisite_state, which is precisely what a locked
-- item is, and it reaches the API as asyncpg.ObjectNotInPrerequisiteStateError
-- so the route can answer 412 rather than 500. The documented status table
-- names 412 for "locked content".
create or replace function app.enforce_module_progress_unlocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.module_is_locked_for(new.student_id, new.module_id) then
    raise exception 'This lesson opens once the earlier lessons in your path are finished'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists student_module_progress_requires_an_open_path_item on app.student_module_progress;
create trigger student_module_progress_requires_an_open_path_item
  before insert or update of completion_percentage, completed_section_ids, is_complete
  on app.student_module_progress
  for each row
  execute function app.enforce_module_progress_unlocked();

create or replace function app.refresh_path_after_module_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.refresh_learning_path(new.student_id);
  return null;
end;
$$;

drop trigger if exists student_module_progress_refreshes_the_path on app.student_module_progress;
create trigger student_module_progress_refreshes_the_path
  after insert or update
  on app.student_module_progress
  for each row
  execute function app.refresh_path_after_module_progress();

-- ---------------------------------------------------------------------------
-- Enforcement — activity attempts
-- ---------------------------------------------------------------------------
create or replace function app.enforce_activity_attempt_unlocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_module_id uuid;
begin
  select activities.module_id into v_module_id
  from app.activities
  where activities.activity_id = new.activity_id;

  if v_module_id is not null and app.module_is_locked_for(new.student_id, v_module_id) then
    raise exception 'This practice opens once the earlier lessons in your path are finished'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists activity_attempts_require_an_open_path_item on app.activity_attempts;
create trigger activity_attempts_require_an_open_path_item
  before insert
  on app.activity_attempts
  for each row
  execute function app.enforce_activity_attempt_unlocked();

create or replace function app.refresh_path_after_activity_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.refresh_learning_path(new.student_id);
  return null;
end;
$$;

drop trigger if exists activity_attempts_refresh_the_path on app.activity_attempts;
create trigger activity_attempts_refresh_the_path
  after insert or update of status
  on app.activity_attempts
  for each row
  execute function app.refresh_path_after_activity_attempt();

-- ---------------------------------------------------------------------------
-- Initial path creation
-- ---------------------------------------------------------------------------
-- The diagnostic rebuild inserts the whole path in one statement, so this runs
-- once per rebuild rather than once per item. It exists because the rebuild
-- assigns `available` to priority 1 unconditionally, and a learner whose
-- priority 1 module was already finished before the diagnostic should land on
-- priority 2 rather than on a completed item.
create or replace function app.refresh_path_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
begin
  for v_student_id in select distinct inserted.student_id from inserted loop
    perform app.refresh_learning_path(v_student_id);
  end loop;
  return null;
end;
$$;

drop trigger if exists learning_path_items_refresh_after_insert on app.learning_path_items;
create trigger learning_path_items_refresh_after_insert
  after insert
  on app.learning_path_items
  referencing new table as inserted
  for each statement
  execute function app.refresh_path_after_insert();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- No role calls these directly. They run as the definer from triggers, and a
-- learner has no business asking for a path recomputation out of band.
revoke all on function app.refresh_learning_path(uuid) from public;
revoke all on function app.module_is_locked_for(uuid, uuid) from public;
revoke all on function app.enforce_module_progress_unlocked() from public;
revoke all on function app.refresh_path_after_module_progress() from public;
revoke all on function app.enforce_activity_attempt_unlocked() from public;
revoke all on function app.refresh_path_after_activity_attempt() from public;
revoke all on function app.refresh_path_after_insert() from public;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- Every learner who already has a path is holding statuses frozen at their
-- last diagnostic. Recompute them once so the fix applies to work already
-- done rather than only to work done from now on.
do $$
declare
  v_student_id uuid;
begin
  for v_student_id in
    select distinct learning_path_items.student_id from app.learning_path_items
  loop
    perform app.refresh_learning_path(v_student_id);
  end loop;
end;
$$;
