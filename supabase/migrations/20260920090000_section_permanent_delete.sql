-- Permanent deletion of a retired class section.
--
-- Until now a section could only be archived: `is_active` goes false and the
-- row stays, which is right for a section that ever held learners, because
-- their history points at it. But a section created by mistake — a typo, a
-- duplicate, a trial — has no history to protect, and leaving it in the
-- directory forever is its own kind of wrong. This adds the one privilege that
-- was missing, with the guards that make it safe to hold.
--
-- Three things keep this narrow, and none of them depends on the API asking
-- nicely:
--
--   1. Only a Teacher/Administrator may delete, as with every other write here.
--   2. Only an already-deactivated section may be deleted. Retiring it is a
--      separate, reversible decision that has to be taken first, so a live
--      class can never be removed in one step.
--   3. `student_profiles_section_in_grade_fkey` is ON DELETE RESTRICT, so
--      PostgreSQL itself refuses to delete a section any learner still points
--      at. That constraint is unchanged and is the real guarantee; the policy
--      below is the second lock, not the first.
--
-- The archiving path is untouched: `DELETE /teacher-admin/sections/{id}` still
-- means deactivate, exactly as the API documentation describes it.

grant delete on app.sections to authenticated;

create policy sections_delete
  on app.sections
  for delete
  to authenticated
  using (
    (select app.is_teacher_admin())
    -- A live section is never deletable. Deactivate it first, which is
    -- reversible, and only then is this row in scope for removal at all.
    and is_active = false
  );

comment on table app.sections is
  'Class section within a grade level. adviser_id is the assigned Teacher/Administrator, if any. Deactivating a section retires it and is reversible; deleting one is permitted only once it is deactivated and no learner references it.';
