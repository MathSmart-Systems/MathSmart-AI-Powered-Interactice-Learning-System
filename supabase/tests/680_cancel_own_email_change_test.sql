-- MathSmart — withdrawing one's own pending email change.
--
-- `app.cancel_own_email_change()` clears the caller's pending address and both
-- confirmation links, never the sign-in email, and never anybody else's.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

select ok(
  not has_function_privilege('anon', 'app.cancel_own_email_change()', 'execute'),
  'anon cannot call it'
);

insert into auth.users (id, email, email_change, email_change_token_current, email_change_token_new)
values
  ('ae000000-0000-4000-8000-0000000008a1', 'cancel.me@mathsmart.test', 'cancel.new@mathsmart.test', 'hash-current-1', 'hash-new-1'),
  ('ae000000-0000-4000-8000-0000000008a2', 'cancel.other@mathsmart.test', 'other.new@mathsmart.test', 'hash-current-2', 'hash-new-2');
insert into app.user_profiles (user_id, full_name, email, role) values
  ('ae000000-0000-4000-8000-0000000008a1', 'Cancel Me', 'cancel.me@mathsmart.test', 'teacher_admin'),
  ('ae000000-0000-4000-8000-0000000008a2', 'Cancel Other', 'cancel.other@mathsmart.test', 'teacher_admin');
insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to) values
  (gen_random_uuid(), 'ae000000-0000-4000-8000-0000000008a1', 'email_change_token_current', 'hash-current-1', 'cancel.me@mathsmart.test'),
  (gen_random_uuid(), 'ae000000-0000-4000-8000-0000000008a1', 'email_change_token_new', 'hash-new-1', 'cancel.new@mathsmart.test'),
  (gen_random_uuid(), 'ae000000-0000-4000-8000-0000000008a2', 'email_change_token_new', 'hash-new-2', 'other.new@mathsmart.test');

set local request.jwt.claims = '{"sub":"ae000000-0000-4000-8000-0000000008a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is(app.cancel_own_email_change(), true, 'A pending change is withdrawn');
select is(app.cancel_own_email_change(), false, 'Asking again finds nothing pending');

reset role;

select is(
  (select email || '|' || email_change || '|' || email_change_token_current || '|' || email_change_token_new
     from auth.users where id = 'ae000000-0000-4000-8000-0000000008a1'),
  'cancel.me@mathsmart.test|||',
  'The sign-in email stays; the pending address and both tokens are gone'
);
select is(
  (select count(*)::integer from auth.one_time_tokens
    where user_id = 'ae000000-0000-4000-8000-0000000008a1'),
  0,
  'Neither confirmation link can be verified any more'
);
select is(
  (select email_change from auth.users where id = 'ae000000-0000-4000-8000-0000000008a2'),
  'other.new@mathsmart.test',
  'Another user''s pending change is untouched'
);
select is(
  (select count(*)::integer from auth.one_time_tokens
    where user_id = 'ae000000-0000-4000-8000-0000000008a2'),
  1,
  'Another user''s link still stands'
);
select is(
  (select email from app.user_profiles where user_id = 'ae000000-0000-4000-8000-0000000008a1'),
  'cancel.me@mathsmart.test',
  'The profile email is unchanged'
);

select * from finish();
rollback;
