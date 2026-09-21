-- The profile email follows the confirmed sign-in email, and only that.
--
-- A Teacher/Administrator can now change their sign-in email from Settings.
-- Supabase Auth runs that as a secure email change: the requested address
-- waits in `auth.users.email_change` until the confirmation links sent to
-- both the current and the new address have been followed, and only then
-- becomes `auth.users.email`. Until that moment the old address is still the
-- one that signs in.
--
-- `app.user_profiles.email` is what the application shows and searches, so it
-- has to move when — and only when — the sign-in email itself moves. Hooking
-- the update of `auth.users.email` gives exactly that: a pending
-- `email_change` never fires it, so an address nobody has confirmed can never
-- become the stored account email, whatever the browser or the confirmation
-- screen does or fails to do.
--
-- The address is normalised the way the profile's own CHECK constraints
-- require. A row with no profile (an Auth user the application never
-- enrolled) is left alone.

create or replace function app.sync_confirmed_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or new.email is not distinct from old.email then
    return new;
  end if;

  update app.user_profiles
  set email = lower(btrim(new.email))
  where user_profiles.user_id = new.id
    and user_profiles.email is distinct from lower(btrim(new.email));

  return new;
end;
$$;

comment on function app.sync_confirmed_email() is
  'Copies a confirmed auth.users.email into app.user_profiles.email. Fires only when the sign-in email itself changes, never for a pending email_change.';

revoke all on function app.sync_confirmed_email() from public;
revoke all on function app.sync_confirmed_email() from anon, authenticated;

drop trigger if exists sync_confirmed_email on auth.users;

create trigger sync_confirmed_email
  after update of email on auth.users
  for each row
  execute function app.sync_confirmed_email();
