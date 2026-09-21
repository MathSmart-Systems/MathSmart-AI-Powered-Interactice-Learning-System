-- A learner may know that their teacher is helping. Nothing more.
--
-- The learner dashboard has always carried a notice for exactly this, and it
-- has never once been shown. `app.interventions` is readable by
-- Teacher/Administrators only — deliberately, because a case holds an
-- educator's notes, a severity, the trigger that opened it and advisory text —
-- and `app.student_performance_summary` is `security_invoker`, so when a
-- learner reads their own summary the subquery that counts their open cases
-- sees no rows and answers 0. Every learner, always.
--
-- Loosening the table policy would hand learners the notes and the severity.
-- Adding a learner-facing view would still expose the rows. What the notice
-- needs is one number, so this returns one number: how many of the caller's
-- own cases are open or in progress. It takes no argument, so there is nothing
-- to aim at somebody else; the learner is `auth.uid()`'s own profile and no
-- one else's. It reveals no severity, no reason, no status split, no teacher
-- and no text. A caller without a learner profile — a Teacher/Administrator,
-- or anyone else — gets NULL, which is "this question is not yours to ask",
-- rather than a zero that would read as an answer.

create or replace function app.own_open_intervention_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
begin
  -- A suspended or archived account is refused everywhere else in the API.
  -- It is refused here too, rather than being the one door left open.
  if not app.is_active_account() then
    return null;
  end if;

  select student_profiles.student_id
  into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid());

  if v_student_id is null then
    return null;
  end if;

  return (
    select count(*)::integer
    from app.interventions
    where interventions.student_id = v_student_id
      and interventions.archived_at is null
      and interventions.status in ('Needs Intervention', 'In Progress')
  );
end;
$$;

comment on function app.own_open_intervention_count() is
  'How many of the calling learner''s own intervention cases are open or in progress. One integer, for a supportive notice; never severity, reasons, notes, advice or anybody else''s cases. NULL for a caller without a learner profile.';

revoke all on function app.own_open_intervention_count() from public;
revoke all on function app.own_open_intervention_count() from anon;
grant execute on function app.own_open_intervention_count() to authenticated, service_role;
