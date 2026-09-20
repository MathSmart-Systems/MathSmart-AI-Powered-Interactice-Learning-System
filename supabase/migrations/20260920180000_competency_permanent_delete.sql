-- MathSmart — removing a competency that was never used.
--
-- Archiving is the right answer for a competency that has been taught: its
-- questions, modules, and the learner records pointing at it all have to
-- survive. This is for the other case — a code typed wrong, a draft abandoned,
-- a duplicate created by accident — where archiving only leaves a dead entry
-- nobody can clear.
--
-- Two guards, and neither of them is the interface.
--
-- The policy below admits only a Teacher/Administrator, and only a competency
-- that is already archived. Archiving is reversible, so every deletion is
-- reached through a state the teacher could have stepped back from, and a live
-- or draft competency is never one click from being gone.
--
-- What makes it safe is the second guard, which was here already: every one of
-- the seven foreign keys pointing at app.competencies is ON DELETE RESTRICT.
-- A competency carrying a question, a module, a learner's progress, a result,
-- a learning-path item, an intervention or a delivered-question snapshot
-- cannot be deleted — PostgreSQL refuses it, whatever this policy says and
-- whatever the API forgets to check. That is the guarantee; the API's own
-- reference count exists to explain the refusal, not to be trusted for it.

grant delete on app.competencies to authenticated;

create policy competencies_delete
  on app.competencies
  for delete
  to authenticated
  using (
    (select app.is_teacher_admin())
    -- Archived first. A published or draft competency is not in scope for
    -- removal at all, so the destructive step is always a second decision
    -- taken after a reversible one.
    and status = 'archived'::app.publication_status
  );

comment on policy competencies_delete on app.competencies is
  'A Teacher/Administrator may remove an archived competency. Anything still referenced is refused by the ON DELETE RESTRICT foreign keys, so only a competency that was never used can actually go.';
