-- A newly provisioned project explicitly grants broad privileges in public.
-- Match the hardened Mumbai source before switching application traffic.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated, service_role';
  end if;
end;
$$;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke select, usage on sequences
  from anon, authenticated, service_role;
