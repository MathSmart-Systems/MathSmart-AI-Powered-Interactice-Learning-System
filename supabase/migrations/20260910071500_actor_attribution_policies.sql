-- MathSmart Phase 6 — a write is attributed to the caller who made it.
--
-- app.interventions.teacher_admin_id and app.system_settings.updated_by are the
-- audited actor columns of their tables, and both are in the INSERT grant that
-- `authenticated` holds. The policies on both tables checked only
-- app.is_teacher_admin(), so nothing but the application's own care stopped one
-- Teacher/Administrator from writing another educator's identifier into their
-- own work. Attribution is exactly what an audit record is for, so the database
-- decides it here rather than trusting the statement.
--
-- The reach today is narrow: the app schema is not in the Data API's exposed
-- schemas, so `authenticated` never runs a caller-written statement, and the
-- only writer is the FastAPI boundary, which already takes both values from the
-- verified token. This closes the gap underneath that, so the guarantee is a
-- property of the table rather than of the code above it.
--
-- Both writing paths for an intervention are SECURITY DEFINER functions
-- (app.open_intervention, app.update_intervention) that derive the educator
-- from auth.uid(), so they are unaffected: a definer function does not run
-- these policies at all.

-- ---------------------------------------------------------------------------
-- The caller's own Teacher/Administrator profile
-- ---------------------------------------------------------------------------
-- A plain STABLE SQL function, like the role-claim helpers beside it: it reads
-- one row of app.teacher_admin_profiles as the caller, under that table's own
-- policy, and needs no elevated right. NULL for a learner, and NULL for a
-- Teacher/Administrator who has no profile yet, so a comparison against it is
-- false rather than permissive.
create or replace function app.current_teacher_admin_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select teacher_admin_profiles.teacher_admin_id
  from app.teacher_admin_profiles
  where teacher_admin_profiles.user_id = (select auth.uid());
$$;

comment on function app.current_teacher_admin_id() is
  'The calling Teacher/Administrator''s own profile identifier, or NULL when the caller has none. Used by the policies that bind an audited actor column to the caller.';

revoke all on function app.current_teacher_admin_id() from public;
grant execute on function app.current_teacher_admin_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.interventions
-- ---------------------------------------------------------------------------
-- teacher_admin_id is not in the UPDATE grant, so a case cannot be
-- re-attributed after the fact and only the INSERT needs the new check. The
-- UPDATE policy is deliberately left as it was: educators share one queue, and
-- one may act on a case another opened.
drop policy if exists interventions_insert on app.interventions;

create policy interventions_insert
  on app.interventions
  for insert
  to authenticated
  with check (
    (select app.is_teacher_admin())
    and teacher_admin_id = (select app.current_teacher_admin_id())
  );

comment on policy interventions_insert on app.interventions is
  'A Teacher/Administrator may open a case only in their own name: the audited educator column must be the caller''s own profile.';

-- ---------------------------------------------------------------------------
-- app.system_settings
-- ---------------------------------------------------------------------------
-- updated_by is in both grants here, so both policies carry the check. The
-- column holds a user_id rather than a profile identifier, so the caller is
-- auth.uid() directly.
drop policy if exists system_settings_insert on app.system_settings;

create policy system_settings_insert
  on app.system_settings
  for insert
  to authenticated
  with check (
    (select app.is_teacher_admin())
    and updated_by = (select auth.uid())
  );

drop policy if exists system_settings_update on app.system_settings;

create policy system_settings_update
  on app.system_settings
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check (
    (select app.is_teacher_admin())
    and updated_by = (select auth.uid())
  );

comment on policy system_settings_insert on app.system_settings is
  'A configuration change records the Teacher/Administrator who made it, and it must be the caller.';

comment on policy system_settings_update on app.system_settings is
  'A configuration change records the Teacher/Administrator who made it, and it must be the caller.';
