-- MathSmart — the Groq classroom setting as one boolean.
--
-- `app.groq_advisory_enabled()` lets every advisory call, including the ones
-- made for a learner, ask whether the classroom setting allows Groq without
-- anybody but a Teacher/Administrator reading `app.system_settings`.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

select function_returns(
  'app', 'groq_advisory_enabled', array[]::name[], 'boolean',
  'It answers yes or no and nothing a row could carry'
);

select ok(
  not has_function_privilege('anon', 'app.groq_advisory_enabled()', 'execute'),
  'anon cannot ask'
);

insert into auth.users (id, email) values
  ('ae000000-0000-4000-8000-0000000006a1', 'gate.adviser@mathsmart.test'),
  ('be000000-0000-4000-8000-0000000006b1', 'gate.learner@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('ae000000-0000-4000-8000-0000000006a1', 'Gate Adviser', 'gate.adviser@mathsmart.test', 'teacher_admin'),
  ('be000000-0000-4000-8000-0000000006b1', 'Gate Learner', 'gate.learner@mathsmart.test', 'student');

-- Start from nothing stored, whatever this database held before.
delete from app.system_settings where setting_key like 'features.groq%';

set local request.jwt.claims = '{"sub":"be000000-0000-4000-8000-0000000006b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is(app.groq_advisory_enabled(), false, 'With nothing stored, Groq is off');

reset role;
insert into app.system_settings (setting_key, setting_value, updated_by) values
  ('features.groq_enabled', 'true', 'ae000000-0000-4000-8000-0000000006a1');

set local role authenticated;
select is(app.groq_advisory_enabled(), true, 'An older stored key still counts');

reset role;
insert into app.system_settings (setting_key, setting_value, updated_by) values
  ('features.groq_advisory', 'false', 'ae000000-0000-4000-8000-0000000006a1');

set local role authenticated;
select is(app.groq_advisory_enabled(), false, 'features.groq_advisory wins over the older keys');

select is_empty(
  'select 1 from app.system_settings',
  'A learner still cannot read a single setting row'
);

reset role;
update app.system_settings set setting_value = '"true"'
where setting_key = 'features.groq_advisory';

set local role authenticated;
select is(app.groq_advisory_enabled(), false, 'Only a real boolean true turns it on');

reset role;
update app.user_profiles set account_status = 'suspended'
where user_id = 'be000000-0000-4000-8000-0000000006b1';
update app.system_settings set setting_value = 'true'
where setting_key = 'features.groq_advisory';

set local role authenticated;
select is(app.groq_advisory_enabled(), false, 'A suspended account is told no');

reset role;
select * from finish();
rollback;
