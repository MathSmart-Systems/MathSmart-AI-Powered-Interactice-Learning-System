-- MathSmart Phase 1 — database foundation, part 3 of 4.
--
-- Privileges and Row Level Security for the foundation tables.
--
-- Two independent controls, applied deliberately
-- ----------------------------------------------
--  * GRANT / REVOKE decide whether a database role can reach an object or a
--    column at all. They are the only control that can hide a column, and a
--    missing grant raises 42501 before any policy is evaluated.
--  * RLS policies decide which rows a role that can reach the object may see or
--    write. RLS cannot hide a column.
--
-- Role model
-- ----------
--  * `anon`         — no privilege on anything in `app`. Unauthenticated callers
--                     have no access to MathSmart application data, ever.
--  * `authenticated`— narrow, column-scoped DML privileges. Every row decision
--                     is then made by the policies below, which read the role
--                     from the trusted `app_metadata` claim. The `app` schema is
--                     not exposed through the Data API, so in practice this role
--                     is unreachable over HTTP; the grants and policies are
--                     defence in depth and are exercised by supabase/tests.
--  * `service_role` — the FastAPI backend identity. Full DML, and it bypasses
--                     RLS, so application authorization stays FastAPI's job.
--
-- Provisioning note
-- -----------------
-- MathSmart accounts are administrator-provisioned; there is no public
-- registration. Creating an Auth identity and setting its `app_metadata` role
-- claim is a backend-only operation, so `authenticated` receives no INSERT
-- privilege on app.user_profiles or app.teacher_admin_profiles. Enrolling a
-- learner whose account already exists is inside the documented school-wide
-- Teacher/Administrator scope, so INSERT on app.student_profiles is granted and
-- then restricted to that role by policy.
--
-- No role except `service_role` receives DELETE anywhere: grades and sections
-- are archived through `is_active`, and account removal is an audited backend
-- workflow that must revoke sessions first.
--
-- Policy shape
-- ------------
-- One permissive policy per (table, command). Two overlapping permissive
-- policies would be OR-ed together at a per-row cost for no added protection,
-- so each policy states both branches explicitly instead. Every auth helper is
-- wrapped in `(select ...)` so the planner evaluates it once per statement
-- rather than once per row.

-- ---------------------------------------------------------------------------
-- Enable Row Level Security on every application table
-- ---------------------------------------------------------------------------
alter table app.user_profiles          enable row level security;
alter table app.grade_levels           enable row level security;
alter table app.teacher_admin_profiles enable row level security;
alter table app.sections               enable row level security;
alter table app.student_profiles       enable row level security;

-- ---------------------------------------------------------------------------
-- Baseline: revoke everything, then grant back explicitly
-- ---------------------------------------------------------------------------
revoke all on app.user_profiles          from public, anon, authenticated;
revoke all on app.grade_levels           from public, anon, authenticated;
revoke all on app.teacher_admin_profiles from public, anon, authenticated;
revoke all on app.sections               from public, anon, authenticated;
revoke all on app.student_profiles       from public, anon, authenticated;

-- The FastAPI backend boundary.
grant select, insert, update, delete on app.user_profiles          to service_role;
grant select, insert, update, delete on app.grade_levels           to service_role;
grant select, insert, update, delete on app.teacher_admin_profiles to service_role;
grant select, insert, update, delete on app.sections               to service_role;
grant select, insert, update, delete on app.student_profiles       to service_role;

-- ---------------------------------------------------------------------------
-- app.user_profiles
-- ---------------------------------------------------------------------------
grant select on app.user_profiles to authenticated;
-- Identity fields only. `role`, `email` and `user_id` are unreachable for
-- `authenticated` at the privilege level, so no policy can be tricked into
-- letting anyone escalate their own role or take over another account's email.
grant update (full_name, avatar_url) on app.user_profiles to authenticated;

-- Read: own profile, or any profile for school-wide administration.
create policy user_profiles_select
  on app.user_profiles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.is_teacher_admin())
  );

-- Write: own display fields, or any profile's display fields for a
-- Teacher/Administrator. The column grant above already keeps `role` and
-- `email` out of reach for both branches.
create policy user_profiles_update
  on app.user_profiles
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.is_teacher_admin())
  )
  with check (
    user_id = (select auth.uid())
    or (select app.is_teacher_admin())
  );

-- ---------------------------------------------------------------------------
-- app.grade_levels
-- ---------------------------------------------------------------------------
grant select on app.grade_levels to authenticated;
grant insert (name, level, is_active) on app.grade_levels to authenticated;
grant update (name, level, is_active) on app.grade_levels to authenticated;

-- Learners see active grades only; a Teacher/Administrator sees every state,
-- including archived grades.
create policy grade_levels_select
  on app.grade_levels
  for select
  to authenticated
  using (
    is_active
    or (select app.is_teacher_admin())
  );

create policy grade_levels_insert
  on app.grade_levels
  for insert
  to authenticated
  with check ((select app.is_teacher_admin()));

create policy grade_levels_update
  on app.grade_levels
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check ((select app.is_teacher_admin()));

-- ---------------------------------------------------------------------------
-- app.teacher_admin_profiles
-- ---------------------------------------------------------------------------
grant select on app.teacher_admin_profiles to authenticated;
grant update (employee_id, school_name, division_name) on app.teacher_admin_profiles to authenticated;

create policy teacher_admin_profiles_select
  on app.teacher_admin_profiles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.is_teacher_admin())
  );

create policy teacher_admin_profiles_update
  on app.teacher_admin_profiles
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check ((select app.is_teacher_admin()));

-- ---------------------------------------------------------------------------
-- app.sections
-- ---------------------------------------------------------------------------
grant select on app.sections to authenticated;
grant insert (grade_id, adviser_id, name, is_active) on app.sections to authenticated;
grant update (grade_id, adviser_id, name, is_active) on app.sections to authenticated;

-- A learner may read only the section they are enrolled in. The membership
-- subquery is itself subject to the app.student_profiles policy, so it can only
-- ever resolve to the caller's own enrolment.
create policy sections_select
  on app.sections
  for select
  to authenticated
  using (
    (select app.is_teacher_admin())
    or section_id in (
      select student_profiles.section_id
      from app.student_profiles
      where student_profiles.user_id = (select auth.uid())
        and student_profiles.section_id is not null
    )
  );

create policy sections_insert
  on app.sections
  for insert
  to authenticated
  with check ((select app.is_teacher_admin()));

create policy sections_update
  on app.sections
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check ((select app.is_teacher_admin()));

-- ---------------------------------------------------------------------------
-- app.student_profiles
-- ---------------------------------------------------------------------------
grant select on app.student_profiles to authenticated;
-- Enrolment and monitoring are school-managed. A learner holds these privileges
-- only because privileges are per database role, never per claim; the policies
-- below allow the write for a Teacher/Administrator alone. `role` and
-- `student_id` are never writable by `authenticated`, so an enrolment row can
-- only ever take its pinned 'student' role and a server-generated id.
grant insert (user_id, learner_id, grade_id, section_id, monitoring_status) on app.student_profiles to authenticated;
grant update (learner_id, grade_id, section_id, monitoring_status) on app.student_profiles to authenticated;

create policy student_profiles_select
  on app.student_profiles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.is_teacher_admin())
  );

create policy student_profiles_insert
  on app.student_profiles
  for insert
  to authenticated
  with check ((select app.is_teacher_admin()));

create policy student_profiles_update
  on app.student_profiles
  for update
  to authenticated
  using ((select app.is_teacher_admin()))
  with check ((select app.is_teacher_admin()));
