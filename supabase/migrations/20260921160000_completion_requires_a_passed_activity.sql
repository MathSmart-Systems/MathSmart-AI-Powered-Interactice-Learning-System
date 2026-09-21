-- MathSmart Phase 7b — a learner stops certifying their own mastery.
--
-- Why this migration exists
-- -------------------------
-- `app.refresh_learning_path` settled an item as `completed` when
-- `student_module_progress.is_complete` was true. That column is computed from
-- the section identifiers the learner's own browser submits: tick every box
-- and the module is finished, the path item closes, and the next item opens.
--
-- Reading is not evidence of mastery. A learner could tick four boxes without
-- reading a word and unlock the whole path, and nothing in the system would
-- know the difference between that and a child who had actually learned the
-- lesson. The activity attached to the module is the part that measures
-- anything, and it was measuring nothing that mattered.
--
-- What completion means now
-- -------------------------
--   * A module that has a published activity is finished when the learner has
--     **passed** that activity. `activity_attempts.passed` is set by
--     `app.submit_activity_attempt` from the stored answer keys against the
--     activity's own mastery threshold — deterministic, server-side, and not
--     something a client can assert.
--   * A module with no published activity has nothing to pass, so it falls
--     back to reading progress. Without this a learner would be stranded on a
--     lesson the curriculum never gave a way to finish.
--   * An item already recorded `completed` stays completed. That is what keeps
--     a teacher's existing decision, and any override recorded before today,
--     from being taken back by this change.
--
-- Reading progress is still recorded, and still moves an item to
-- `in_progress`. It simply no longer closes one.
--
-- Nothing here consults Groq, and nothing here can: these are SQL functions
-- over stored attempt evidence.

-- ---------------------------------------------------------------------------
-- app.module_has_required_activity
-- ---------------------------------------------------------------------------
-- Whether this module asks the learner to prove anything.
create or replace function app.module_has_required_activity(p_module_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.activities
    where activities.module_id = p_module_id
      and activities.status = 'published'::app.publication_status
  );
$$;

comment on function app.module_has_required_activity(uuid) is
  'True when the module has a published activity a learner has to pass before it counts as finished.';

-- ---------------------------------------------------------------------------
-- app.module_activity_passed
-- ---------------------------------------------------------------------------
-- Whether the learner has passed one of them.
--
-- `passed` is written by `app.submit_activity_attempt` from the frozen answer
-- keys and the activity's own mastery threshold. One pass is enough, and a
-- later failed retry does not take it away: a learner who has demonstrated the
-- skill has demonstrated it.
create or replace function app.module_activity_passed(p_student_id uuid, p_module_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.activity_attempts
    join app.activities
      on activities.activity_id = activity_attempts.activity_id
    where activity_attempts.student_id = p_student_id
      and activities.module_id = p_module_id
      and activity_attempts.passed is true
  );
$$;

comment on function app.module_activity_passed(uuid, uuid) is
  'True when the learner has passed a published activity belonging to this module, judged deterministically at submission.';

-- ---------------------------------------------------------------------------
-- app.module_is_satisfied
-- ---------------------------------------------------------------------------
create or replace function app.module_is_satisfied(p_student_id uuid, p_module_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when app.module_has_required_activity(p_module_id)
      then app.module_activity_passed(p_student_id, p_module_id)
    else coalesce(
      (
        select student_module_progress.is_complete
        from app.student_module_progress
        where student_module_progress.student_id = p_student_id
          and student_module_progress.module_id = p_module_id
      ),
      false
    )
  end;
$$;

comment on function app.module_is_satisfied(uuid, uuid) is
  'Whether a learner has finished a module: passing its activity where one exists, and reading it where none does.';

-- ---------------------------------------------------------------------------
-- app.refresh_learning_path, restated
-- ---------------------------------------------------------------------------
-- The only change is what `settled` means. Priority still belongs to the
-- diagnostic, a completed item is still never downgraded, and the function is
-- still idempotent: it writes only the rows whose status actually changes.
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
      -- Finished, on the evidence: a passed activity, or a read module that
      -- has no activity to pass. The second half of the test is what keeps a
      -- decision already recorded — including a teacher's — from being taken
      -- back by this rule arriving.
      app.module_is_satisfied(items.student_id, items.module_id)
        or items.status = 'completed'::app.path_item_status as settled,
      -- Begun: a recognised section read, or an attempt at its activity
      -- started. Reading still moves an item forward; it just no longer
      -- closes one.
      coalesce(progress.completion_percentage, 0) > 0
        or exists (
          select 1
          from app.activity_attempts
          join app.activities
            on activities.activity_id = activity_attempts.activity_id
          where activity_attempts.student_id = items.student_id
            and activities.module_id = items.module_id
        ) as started
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

-- ---------------------------------------------------------------------------
-- The refresh has to run when an attempt is graded
-- ---------------------------------------------------------------------------
-- `passed` is written by the submission, and the old trigger watched `status`
-- alone. Watching the whole row is simpler than naming columns and cannot fall
-- behind another migration that adds one.
drop trigger if exists activity_attempts_refresh_the_path on app.activity_attempts;
create trigger activity_attempts_refresh_the_path
  after insert or update
  on app.activity_attempts
  for each row
  execute function app.refresh_path_after_activity_attempt();

revoke all on function app.module_has_required_activity(uuid) from public;
revoke all on function app.module_activity_passed(uuid, uuid) from public;
revoke all on function app.module_is_satisfied(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- Settle every existing learner against the new rule
-- ---------------------------------------------------------------------------
-- Items already `completed` keep that status, so nobody loses ground they had
-- been told they held. Items that were open only because a box was ticked
-- close back to `locked` or `available`, which is the point.
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
