-- MathSmart Phase 1 — database foundation, part 1 of 4.
--
-- Creates the private application schema, the role vocabulary, and the shared
-- helper routines that every later MathSmart migration depends on.
--
-- Access model
-- ------------
-- The FastAPI backend is the application-data boundary. The browser talks to
-- Supabase only for authentication. Application tables therefore live in the
-- private `app` schema, which is deliberately absent from `[api].schemas` in
-- supabase/config.toml, so PostgREST never routes a request to them.
--
-- Grants and Row Level Security are two different controls and both are applied:
-- a grant decides whether a role can reach an object at all, RLS decides which
-- rows it may see once it can. RLS is enabled on every application table as
-- defence in depth even though the schema is unexposed.

create schema if not exists app;

comment on schema app is
  'Private MathSmart application schema. Never listed in the Supabase Data API exposed schemas; FastAPI is the application-data boundary. RLS and explicit grants apply as defence in depth.';

-- Close the schema first, then reopen it only for the roles that need it.
-- `anon` is never granted anything: unauthenticated callers have no access to
-- MathSmart application data under any circumstance.
revoke all on schema app from public;
revoke all on schema app from anon;

grant usage on schema app to authenticated;
grant usage on schema app to service_role;

-- Nothing may create objects in `app` except its owner.
revoke create on schema app from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Role vocabulary
-- ---------------------------------------------------------------------------
-- MathSmart production has exactly two roles. Teacher and Administrator are one
-- combined role (`teacher_admin`); there is no third value and no superset role.
create type app.user_role as enum ('student', 'teacher_admin');

comment on type app.user_role is
  'The only two MathSmart production roles. Teacher and Administrator are one combined role.';

-- Learner monitoring vocabulary, per the canonical enum table in docs.
create type app.monitoring_status as enum (
  'active',
  'needs_intervention',
  'improving',
  'mastered',
  'inactive'
);

comment on type app.monitoring_status is
  'Canonical learner monitoring status vocabulary.';

-- ---------------------------------------------------------------------------
-- Trusted role claim helpers
-- ---------------------------------------------------------------------------
-- Authorization reads the role from the verified `app_metadata` claim only.
-- `user_metadata` is user-editable and is never an authorization source.
--
-- These helpers are plain STABLE SQL functions, not SECURITY DEFINER: they read
-- only the request's own JWT and need no elevated rights.

create function app.current_role_claim()
returns app.user_role
language sql
stable
set search_path = ''
as $$
  select case (auth.jwt() -> 'app_metadata' ->> 'role')
           when 'student' then 'student'::app.user_role
           when 'teacher_admin' then 'teacher_admin'::app.user_role
           else null::app.user_role
         end;
$$;

comment on function app.current_role_claim() is
  'The caller''s MathSmart role taken from the trusted app_metadata JWT claim, or NULL when absent or unrecognised. Never reads user_metadata.';

create function app.is_teacher_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(app.current_role_claim() = 'teacher_admin'::app.user_role, false);
$$;

comment on function app.is_teacher_admin() is
  'True when the verified app_metadata role claim is teacher_admin.';

create function app.is_student()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(app.current_role_claim() = 'student'::app.user_role, false);
$$;

comment on function app.is_student() is
  'True when the verified app_metadata role claim is student.';

-- ---------------------------------------------------------------------------
-- Shared trigger routine
-- ---------------------------------------------------------------------------
create function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

comment on function app.set_updated_at() is
  'BEFORE UPDATE trigger routine that keeps updated_at authoritative on the server.';

-- Execute rights are narrow and explicit; PUBLIC never keeps the default grant.
revoke all on function app.current_role_claim() from public;
revoke all on function app.is_teacher_admin() from public;
revoke all on function app.is_student() from public;
revoke all on function app.set_updated_at() from public;

grant execute on function app.current_role_claim() to authenticated, service_role;
grant execute on function app.is_teacher_admin() to authenticated, service_role;
grant execute on function app.is_student() to authenticated, service_role;
grant execute on function app.set_updated_at() to authenticated, service_role;
