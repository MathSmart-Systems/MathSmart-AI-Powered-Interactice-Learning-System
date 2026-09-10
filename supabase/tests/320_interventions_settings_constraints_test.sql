-- MathSmart Phase 4 — intervention lifecycle and settings-safety constraints.
--
-- Two things matter most here. An intervention must stay valid and advanceable
-- with no Groq output at all, and app.system_settings must reject anything that
-- looks like a deployment secret or a model selection.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a5000000-0000-4000-8000-0000000000a1', 'case.adviser@mathsmart.test'),
  ('b5000000-0000-4000-8000-0000000000b1', 'case.learner@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('a5000000-0000-4000-8000-0000000000a1', 'Case Adviser', 'case.adviser@mathsmart.test', 'teacher_admin'),
  ('b5000000-0000-4000-8000-0000000000b1', 'Case Learner', 'case.learner@mathsmart.test', 'student');

insert into app.teacher_admin_profiles (teacher_admin_id, user_id, employee_id, school_name, division_name) values
  ('a5000000-0000-4000-8000-0000000000f1', 'a5000000-0000-4000-8000-0000000000a1',
   'EMP-5001', 'Sample Central Elementary School', 'Sample Division');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('55000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-0000000000b1', 'LRN-500001',
   (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('c5000000-0000-4000-8000-000000000001', 'CASE-COMP-1',
   (select grade_id from app.grade_levels where level = 6), 'Number Sense', 'Case competency', 'published');

-- ---------------------------------------------------------------------------
-- A case is complete without any Groq output
-- ---------------------------------------------------------------------------
insert into app.interventions
  (intervention_id, student_id, teacher_admin_id, competency_id,
   severity, intervention_type, incorrect_patterns, modules_attempted, educator_notes)
values
  ('15000000-0000-4000-8000-000000000001',
   '55000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-0000000000f1',
   'c5000000-0000-4000-8000-000000000001',
   'HIGH', 'One-on-One Remediation',
   '["subtracts before multiplying"]'::jsonb,
   '["Records module one"]'::jsonb,
   'Met the learner after class.');

select is(
  (select status from app.interventions
    where interventions.intervention_id = '15000000-0000-4000-8000-000000000001'),
  'Needs Intervention'::app.intervention_status,
  'A recorded case starts in the Needs Intervention state'
);

select ok(
  (select ai_insight is null and ai_recommendation is null
     from app.interventions
    where interventions.intervention_id = '15000000-0000-4000-8000-000000000001'),
  'A case is valid with no Groq insight and no Groq recommendation'
);

select is(
  (select educator_notes from app.interventions
    where interventions.intervention_id = '15000000-0000-4000-8000-000000000001'),
  'Met the learner after class.',
  'The educator''s own notes are retained and kept distinct from advisory output'
);

select is(
  (select jsonb_array_length(incorrect_patterns) from app.interventions
    where interventions.intervention_id = '15000000-0000-4000-8000-000000000001'),
  1,
  'Deterministic evidence is retained on the case'
);

-- The whole lifecycle runs with Groq absent.
update app.interventions set status = 'In Progress'
where interventions.intervention_id = '15000000-0000-4000-8000-000000000001';

select is(
  (select status from app.interventions
    where interventions.intervention_id = '15000000-0000-4000-8000-000000000001'),
  'In Progress'::app.intervention_status,
  'A case advances to In Progress without any Groq output'
);

update app.interventions set status = 'Resolved', resolved_at = now()
where interventions.intervention_id = '15000000-0000-4000-8000-000000000001';

select ok(
  (select resolved_at is not null from app.interventions
    where interventions.intervention_id = '15000000-0000-4000-8000-000000000001'),
  'A resolved case records when it was resolved'
);

-- Advisory output can be attached later without changing anything authoritative.
update app.interventions
set ai_insight = 'Advisory summary', ai_recommendation = 'Advisory suggestion'
where interventions.intervention_id = '15000000-0000-4000-8000-000000000001';

select is(
  (select status from app.interventions
    where interventions.intervention_id = '15000000-0000-4000-8000-000000000001'),
  'Resolved'::app.intervention_status,
  'Attaching advisory output does not change the authoritative case state'
);

-- ---------------------------------------------------------------------------
-- Lifecycle timestamps
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.interventions
       (student_id, teacher_admin_id, competency_id, severity, intervention_type, status)
     values ('55000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-0000000000f1',
             'c5000000-0000-4000-8000-000000000001', 'LOW', 'Other', 'Resolved') $$,
  '23514', null::text,
  'A resolved case must record when it was resolved'
);

select throws_ok(
  $$ insert into app.interventions
       (student_id, teacher_admin_id, competency_id, severity, intervention_type, resolved_at)
     values ('55000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-0000000000f1',
             'c5000000-0000-4000-8000-000000000001', 'LOW', 'Other', now()) $$,
  '23514', null::text,
  'An unresolved case cannot carry a resolution time'
);

select throws_ok(
  $$ insert into app.interventions
       (student_id, teacher_admin_id, competency_id, severity, intervention_type,
        status, recorded_at, resolved_at)
     values ('55000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-0000000000f1',
             'c5000000-0000-4000-8000-000000000001', 'LOW', 'Other',
             'Resolved', now(), now() - interval '1 hour') $$,
  '23514', null::text,
  'A case cannot be resolved before it was recorded'
);

select throws_ok(
  $$ insert into app.interventions
       (student_id, teacher_admin_id, competency_id, severity, intervention_type, recorded_at)
     values ('55000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-0000000000f1',
             'c5000000-0000-4000-8000-000000000001', 'LOW', 'Other', now() - interval '1 hour') $$,
  '23514', null::text,
  'A case cannot be recorded before it was created'
);

select throws_ok(
  $$ insert into app.interventions
       (student_id, teacher_admin_id, competency_id, severity, intervention_type, archived_at)
     values ('55000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-0000000000f1',
             'c5000000-0000-4000-8000-000000000001', 'LOW', 'Other', now() - interval '1 hour') $$,
  '23514', null::text,
  'A case cannot be archived before it was created'
);

select throws_ok(
  $$ insert into app.interventions
       (student_id, teacher_admin_id, competency_id, severity, intervention_type, incorrect_patterns)
     values ('55000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-0000000000f1',
             'c5000000-0000-4000-8000-000000000001', 'LOW', 'Other', '{"not":"an array"}'::jsonb) $$,
  '23514', null::text,
  'Incorrect-answer evidence must be a JSON array'
);

-- ---------------------------------------------------------------------------
-- A case must point at real people and a real competency
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into app.interventions
       (student_id, teacher_admin_id, competency_id, severity, intervention_type)
     values ('00000000-0000-4000-8000-00000000dead', 'a5000000-0000-4000-8000-0000000000f1',
             'c5000000-0000-4000-8000-000000000001', 'LOW', 'Other') $$,
  '23503', null::text,
  'A case must name a real learner'
);

select throws_ok(
  $$ insert into app.interventions
       (student_id, teacher_admin_id, competency_id, severity, intervention_type)
     values ('55000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000dead',
             'c5000000-0000-4000-8000-000000000001', 'LOW', 'Other') $$,
  '23503', null::text,
  'A case must name a real Teacher/Administrator'
);

select throws_ok(
  $$ insert into app.interventions
       (student_id, teacher_admin_id, competency_id, severity, intervention_type)
     values ('55000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-0000000000f1',
             '00000000-0000-4000-8000-00000000dead', 'LOW', 'Other') $$,
  '23503', null::text,
  'A case must target a real competency'
);

select throws_ok(
  $$ delete from app.teacher_admin_profiles
     where teacher_admin_profiles.teacher_admin_id = 'a5000000-0000-4000-8000-0000000000f1' $$,
  '23503', null::text,
  'The educator who owns a case cannot be removed out from under it'
);

-- Archiving keeps the record.
update app.interventions set archived_at = now()
where interventions.intervention_id = '15000000-0000-4000-8000-000000000001';

select is(
  (select count(*) from app.interventions
    where interventions.intervention_id = '15000000-0000-4000-8000-000000000001'),
  1::bigint,
  'An archived case is retained, not deleted'
);

-- ---------------------------------------------------------------------------
-- System settings hold safe configuration only
-- ---------------------------------------------------------------------------
insert into app.system_settings (setting_key, setting_value, updated_by) values
  ('thresholds.activity_pass_percentage', '75'::jsonb, 'a5000000-0000-4000-8000-0000000000a1'),
  ('intervention.unsuccessful_attempt_trigger', '2'::jsonb, 'a5000000-0000-4000-8000-0000000000a1'),
  ('notifications.digest_enabled', 'true'::jsonb, 'a5000000-0000-4000-8000-0000000000a1'),
  ('features.groq_feedback_enabled', 'false'::jsonb, 'a5000000-0000-4000-8000-0000000000a1');

select is(
  (select setting_value from app.system_settings
    where system_settings.setting_key = 'thresholds.activity_pass_percentage'),
  '75'::jsonb,
  'A pass threshold is safe configuration'
);

select is(
  (select setting_value from app.system_settings
    where system_settings.setting_key = 'features.groq_feedback_enabled'),
  'false'::jsonb,
  'A Groq feature flag is safe configuration'
);

select is(
  (select updated_by from app.system_settings
    where system_settings.setting_key = 'thresholds.activity_pass_percentage'),
  'a5000000-0000-4000-8000-0000000000a1'::uuid,
  'Every setting records the Teacher/Administrator who set it'
);

select throws_ok(
  $$ insert into app.system_settings (setting_key, setting_value, updated_by)
     values ('thresholds.activity_pass_percentage', '80'::jsonb, 'a5000000-0000-4000-8000-0000000000a1') $$,
  '23505', null::text,
  'A setting key is unique'
);

-- A learner can never be recorded as the author of a configuration change.
select throws_ok(
  $$ insert into app.system_settings (setting_key, setting_value, updated_by)
     values ('thresholds.mastery_floor', '80'::jsonb, 'b5000000-0000-4000-8000-0000000000b1') $$,
  '23503', null::text,
  'A settings change cannot be attributed to a learner'
);

-- Namespace and shape.
select throws_ok(
  $$ insert into app.system_settings (setting_key, setting_value, updated_by)
     values ('deployment.region', '"ap-southeast-1"'::jsonb, 'a5000000-0000-4000-8000-0000000000a1') $$,
  '23514', null::text,
  'A setting outside the four safe namespaces is rejected'
);

select throws_ok(
  $$ insert into app.system_settings (setting_key, setting_value, updated_by)
     values ('thresholds', '80'::jsonb, 'a5000000-0000-4000-8000-0000000000a1') $$,
  '23514', null::text,
  'A setting key must be namespaced'
);

-- Secrets, by key.
select throws_ok(
  $$ insert into app.system_settings (setting_key, setting_value, updated_by)
     values ('features.groq_api_key', '"redacted"'::jsonb, 'a5000000-0000-4000-8000-0000000000a1') $$,
  '23514', null::text,
  'A key that names an API credential is rejected'
);

select throws_ok(
  $$ insert into app.system_settings (setting_key, setting_value, updated_by)
     values ('features.groq_model', '"some-model"'::jsonb, 'a5000000-0000-4000-8000-0000000000a1') $$,
  '23514', null::text,
  'The Groq model selection cannot be stored as a setting'
);

select throws_ok(
  $$ insert into app.system_settings (setting_key, setting_value, updated_by)
     values ('notifications.smtp_password', '"redacted"'::jsonb, 'a5000000-0000-4000-8000-0000000000a1') $$,
  '23514', null::text,
  'A key that names a password is rejected'
);

select throws_ok(
  $$ insert into app.system_settings (setting_key, setting_value, updated_by)
     values ('features.service_role_key', '"redacted"'::jsonb, 'a5000000-0000-4000-8000-0000000000a1') $$,
  '23514', null::text,
  'A key that names a Supabase secret key is rejected'
);

-- Secrets, by value.
select throws_ok(
  $$ insert into app.system_settings (setting_key, setting_value, updated_by)
     values ('features.integration', '{"api_key":"redacted"}'::jsonb, 'a5000000-0000-4000-8000-0000000000a1') $$,
  '23514', null::text,
  'A value carrying an API credential is rejected'
);

select throws_ok(
  $$ insert into app.system_settings (setting_key, setting_value, updated_by)
     values ('features.integration', '{"groq_model":"some-model"}'::jsonb, 'a5000000-0000-4000-8000-0000000000a1') $$,
  '23514', null::text,
  'A value carrying the Groq model selection is rejected'
);

select throws_ok(
  $$ insert into app.system_settings (setting_key, setting_value, updated_by)
     values ('features.integration', '{"access_token":"redacted"}'::jsonb, 'a5000000-0000-4000-8000-0000000000a1') $$,
  '23514', null::text,
  'A value carrying an access token is rejected'
);

select throws_ok(
  $$ update app.system_settings set setting_value = '{"password":"redacted"}'::jsonb
     where system_settings.setting_key = 'features.groq_feedback_enabled' $$,
  '23514', null::text,
  'A secret cannot be smuggled into an existing setting by update'
);

select * from finish();

rollback;
