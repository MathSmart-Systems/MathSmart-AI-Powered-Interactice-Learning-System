-- MathSmart — the one audit deletion a permanent purge is allowed to make.
--
-- The audit trail is immutable on purpose: `service_role` may insert and read,
-- and may neither update nor delete. That invariant is worth keeping, and this
-- migration does not relax it — there is still no UPDATE or DELETE grant on
-- app.audit_events for any role.
--
-- But purging a learner cannot avoid it. app.audit_events.actor_user_id
-- references app.user_profiles ON DELETE RESTRICT, and app.record_audit_event
-- stamps the actor from auth.uid(), so a learner who has submitted anything
-- owns rows there as the actor. Those rows both block the deletion of their
-- profile and identify them by name in a trail that outlives them.
--
-- So the exception is written as a function rather than as a grant. A grant
-- would let the backend erase any audit record at all; this can only ever
-- remove the records of one learner, it refuses outright to touch anybody who
-- is not one, and what it does is readable in one place.

create function app.purge_learner_audit_trail(p_user_id uuid)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_removed bigint;
begin
  -- The guard that makes this safe to grant. A Teacher/Administrator's audit
  -- trail is the record of what they did to other people's children, and no
  -- argument to this function can reach it.
  if not exists (
    select 1
    from app.user_profiles
    where user_profiles.user_id = p_user_id
      and user_profiles.role = 'student'::app.user_role
  ) then
    raise exception 'Only a learner''s audit records may be purged'
      using errcode = '42501';
  end if;

  delete from app.audit_events
  where audit_events.actor_user_id = p_user_id
     or (
       audit_events.target_id = p_user_id
       and audit_events.target_type in ('user_profile', 'auth_user', 'student_profile')
     );

  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

comment on function app.purge_learner_audit_trail(uuid) is
  'Removes one learner''s own audit records as part of a permanent purge. Refuses any account that is not a learner. Exists so app.audit_events needs no DELETE grant.';

revoke all on function app.purge_learner_audit_trail(uuid) from public;
revoke all on function app.purge_learner_audit_trail(uuid) from anon;
revoke all on function app.purge_learner_audit_trail(uuid) from authenticated;

-- The isolated elevated backend, and nothing else. `authenticated` is the role
-- a browser session holds, and it is deliberately absent.
grant execute on function app.purge_learner_audit_trail(uuid) to service_role;
