-- MathSmart Phase 6 — least privilege for a pre-existing public event-trigger
-- function.
--
-- What this is about
-- ------------------
-- The hosted project carries a function this repository did not create:
--
--   public.rls_auto_enable() returns event_trigger
--     security definer, set search_path to 'pg_catalog', owner postgres
--
-- It backs the event trigger `ensure_rls` (ddl_command_end on CREATE TABLE,
-- CREATE TABLE AS and SELECT INTO), which enables Row Level Security on tables
-- created in `public`. It is not Supabase-managed: every function the platform
-- ships for its own event triggers is owned by `supabase_admin` and lives in
-- `extensions`, and this one is owned by `postgres` and lives in `public`, with
-- no extension membership.
--
-- Its ACL, however, is `{=X/postgres, ..., anon=X, authenticated=X,
-- service_role=X}` — EXECUTE granted to PUBLIC and to both API roles. That is
-- what the database linter reports as
-- `anon_security_definer_function_executable`.
--
-- Why the grant is unnecessary
-- ----------------------------
-- An event trigger function is invoked by the event trigger manager as part of
-- the DDL that fired it. PostgreSQL does not consult EXECUTE privileges to do
-- that, exactly as it does not for a row-level trigger function. Revoking the
-- grant therefore cannot stop `ensure_rls` from working.
--
-- Nor does the grant buy anything: the function's return type is the pseudo-type
-- `event_trigger`, so PostgreSQL refuses a direct call, and PostgREST cannot
-- expose a function whose return type is a pseudo-type. The privilege is
-- unreachable — which is the argument for removing it rather than keeping it.
-- An unreachable grant is still a grant, and the reachability is a property of
-- today's return type rather than of anyone's intent.
--
-- What this migration does not do
-- -------------------------------
-- It does not drop the function and it does not touch the `ensure_rls` trigger.
-- The trigger has one dependent object, the function itself, and dropping
-- either would silently stop new `public` tables from getting RLS — a
-- protection somebody deliberately added. Least privilege here means removing
-- the EXECUTE grant, not the safeguard.
--
-- It also does not touch `alter default privileges`. Blanket default-privilege
-- changes on `public` would apply to functions Supabase creates during
-- extension installation and upgrades, and the failure mode is a broken
-- platform feature discovered later. The narrow revoke below is enough.
--
-- The whole thing is guarded and idempotent: the function does not exist on a
-- fresh local stack, and running this twice is the same as running it once.

do $$
begin
  if exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'rls_auto_enable'
      and pg_get_function_identity_arguments(pg_proc.oid) = ''
  ) then
    revoke all on function public.rls_auto_enable() from public;
    revoke all on function public.rls_auto_enable() from anon;
    revoke all on function public.rls_auto_enable() from authenticated;
    revoke all on function public.rls_auto_enable() from service_role;

    comment on function public.rls_auto_enable() is
      'Event trigger function behind ensure_rls. EXECUTE is revoked from PUBLIC, anon, authenticated and service_role: the event trigger manager invokes it without consulting privileges, so the grant added reach without adding capability.';

    raise notice 'public.rls_auto_enable(): EXECUTE revoked from PUBLIC, anon, authenticated, service_role';
  else
    raise notice 'public.rls_auto_enable() is not present; nothing to revoke';
  end if;
end;
$$;
