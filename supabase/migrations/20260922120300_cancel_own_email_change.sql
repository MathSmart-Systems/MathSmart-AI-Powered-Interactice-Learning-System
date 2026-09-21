-- A signed-in user may withdraw their own pending email change.
--
-- Supabase Auth has no user-facing way to take back an email change once it
-- has been requested: the new address waits in `auth.users.email_change`, and
-- a confirmation link for each address waits in `auth.one_time_tokens` (and,
-- in older Auth versions, in the `email_change_token_*` columns). Until those
-- links expire, following them would still finish the change.
--
-- This clears all of it for the caller, and only for the caller: the function
-- takes no argument, so there is no one else to aim it at. The sign-in email
-- is not touched. Both confirmation links stop working at once, because the
-- token hashes they carry no longer exist anywhere Auth looks. It needs no
-- service key; the API calls it as the signed-in user.
--
-- Returns true when a change was pending and has been withdrawn, false when
-- there was nothing to withdraw. A suspended or archived account is refused,
-- as everywhere else.

create or replace function app.cancel_own_email_change()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_pending boolean;
begin
  if v_user is null or not app.is_active_account() then
    raise exception 'Not signed in with an active account'
      using errcode = '42501';
  end if;

  select coalesce(users.email_change, '') <> ''
  into v_pending
  from auth.users
  where users.id = v_user;

  update auth.users
  set email_change = '',
      email_change_token_new = '',
      email_change_token_current = '',
      email_change_confirm_status = 0,
      email_change_sent_at = null
  where users.id = v_user;

  delete from auth.one_time_tokens
  where one_time_tokens.user_id = v_user
    and one_time_tokens.token_type::text in (
      'email_change_token_new',
      'email_change_token_current'
    );

  return coalesce(v_pending, false);
end;
$$;

comment on function app.cancel_own_email_change() is
  'Withdraws the calling user''s own pending email change: clears the pending address and both confirmation links. Never changes the sign-in email, and never touches another account.';

revoke all on function app.cancel_own_email_change() from public;
revoke all on function app.cancel_own_email_change() from anon;
grant execute on function app.cancel_own_email_change() to authenticated, service_role;
