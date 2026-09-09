-- MathSmart Phase 6 — no SECURITY DEFINER function in `public` is reachable by
-- an API role.
--
-- The hosted project carries public.rls_auto_enable(), an event trigger
-- function this repository did not create, whose ACL granted EXECUTE to PUBLIC,
-- anon and authenticated. The Phase 6 hardening migration revokes that.
--
-- Two of the assertions below are unavoidably conditional: the function exists
-- only on the hosted project, so on a fresh local stack they assert that it is
-- absent rather than that it is locked down. The third is unconditional and is
-- the one that generalises — whatever ends up in `public`, no definer function
-- there may be executable by an API role.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- The general invariant, checked wherever this runs
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(pg_proc.proname, ',' order by pg_proc.proname), '')
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'public'
     and pg_proc.prosecdef
     and (has_function_privilege('anon', pg_proc.oid, 'execute')
          or has_function_privilege('authenticated', pg_proc.oid, 'execute'))),
  '',
  'No SECURITY DEFINER function in public is executable by anon or authenticated'
);

-- ---------------------------------------------------------------------------
-- The specific function, when it is here
-- ---------------------------------------------------------------------------
select ok(
  not exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'rls_auto_enable'
      and (has_function_privilege('anon', pg_proc.oid, 'execute')
           or has_function_privilege('authenticated', pg_proc.oid, 'execute')
           or has_function_privilege('service_role', pg_proc.oid, 'execute'))
  ),
  'public.rls_auto_enable() is not executable by anon, authenticated or service_role'
);

-- PUBLIC is checked separately: a grant to PUBLIC reaches every role, including
-- ones added later, so it is the one that matters most and the easiest to miss.
select ok(
  not exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'rls_auto_enable'
      and array_to_string(coalesce(pg_proc.proacl, '{}'::aclitem[]), ',') like '=X/%'
  ),
  'public.rls_auto_enable() carries no EXECUTE grant to PUBLIC'
);

-- ---------------------------------------------------------------------------
-- The safeguard itself is left alone
-- ---------------------------------------------------------------------------
-- Where the function exists, its event trigger must still exist with it: the
-- hardening removes a grant, never the protection.
select is(
  (select count(*)
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'public' and pg_proc.proname = 'rls_auto_enable'),
  (select count(*)
   from pg_event_trigger
   join pg_proc on pg_proc.oid = pg_event_trigger.evtfoid
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'public' and pg_proc.proname = 'rls_auto_enable'),
  'Wherever public.rls_auto_enable() exists, its event trigger exists too'
);

select * from finish();
rollback;
