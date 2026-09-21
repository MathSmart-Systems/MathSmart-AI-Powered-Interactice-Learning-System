-- MathSmart — the profile email follows only a confirmed sign-in email.
--
-- A secure email change keeps the requested address in
-- `auth.users.email_change` until both confirmation links are followed. The
-- profile must not see it until `auth.users.email` itself changes.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

select ok(
  not has_function_privilege('authenticated', 'app.sync_confirmed_email()', 'execute'),
  'Nobody signed in can call the sync function directly'
);

insert into auth.users (id, email) values
  ('ae000000-0000-4000-8000-0000000007a1', 'email.adviser@mathsmart.test');
insert into app.user_profiles (user_id, full_name, email, role) values
  ('ae000000-0000-4000-8000-0000000007a1', 'Email Adviser', 'email.adviser@mathsmart.test', 'teacher_admin');

-- The request: Supabase records the new address as pending.
update auth.users
set email_change = 'email.new@mathsmart.test', email_change_sent_at = now()
where id = 'ae000000-0000-4000-8000-0000000007a1';

select is(
  (select email from app.user_profiles where user_id = 'ae000000-0000-4000-8000-0000000007a1'),
  'email.adviser@mathsmart.test',
  'A pending change leaves the stored email as it was'
);

-- Unrelated updates to the Auth row do not touch the profile either.
update auth.users set last_sign_in_at = now()
where id = 'ae000000-0000-4000-8000-0000000007a1';

select is(
  (select email from app.user_profiles where user_id = 'ae000000-0000-4000-8000-0000000007a1'),
  'email.adviser@mathsmart.test',
  'Other Auth updates leave it alone'
);

-- Both links followed: Supabase moves the address into email.
update auth.users
set email = ' Email.New@MathSmart.test ', email_change = ''
where id = 'ae000000-0000-4000-8000-0000000007a1';

select is(
  (select email from app.user_profiles where user_id = 'ae000000-0000-4000-8000-0000000007a1'),
  'email.new@mathsmart.test',
  'The confirmed address becomes the stored email, normalised'
);

-- An Auth user with no profile changes without error.
insert into auth.users (id, email) values
  ('ae000000-0000-4000-8000-0000000007a2', 'no.profile@mathsmart.test');
select lives_ok(
  $$update auth.users set email = 'still.no.profile@mathsmart.test'
    where id = 'ae000000-0000-4000-8000-0000000007a2'$$,
  'An Auth user without a profile is left alone'
);

select * from finish();
rollback;
