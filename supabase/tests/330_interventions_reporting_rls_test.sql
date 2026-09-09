-- MathSmart Phase 4 — intervention and reporting access control.
--
-- Asserts that only a Teacher/Administrator manages cases and configuration,
-- and that the reporting views honour the base-table policies rather than
-- becoming a way around them. The same view query is run as a learner and as a
-- Teacher/Administrator and must return different, correctly scoped answers.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures, created as the migration owner
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a6000000-0000-4000-8000-0000000000a1', 'report.adviser@mathsmart.test'),
  ('b6000000-0000-4000-8000-0000000000b1', 'report.learner.one@mathsmart.test'),
  ('b6000000-0000-4000-8000-0000000000b2', 'report.learner.two@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('a6000000-0000-4000-8000-0000000000a1', 'Report Adviser', 'report.adviser@mathsmart.test', 'teacher_admin'),
  ('b6000000-0000-4000-8000-0000000000b1', 'Report Learner One', 'report.learner.one@mathsmart.test', 'student'),
  ('b6000000-0000-4000-8000-0000000000b2', 'Report Learner Two', 'report.learner.two@mathsmart.test', 'student');

insert into app.teacher_admin_profiles (teacher_admin_id, user_id, employee_id, school_name, division_name) values
  ('a6000000-0000-4000-8000-0000000000f1', 'a6000000-0000-4000-8000-0000000000a1',
   'EMP-6001', 'Sample Central Elementary School', 'Sample Division');

insert into app.sections (section_id, grade_id, name, adviser_id) values
  ('e6000000-0000-4000-8000-000000000001',
   (select grade_id from app.grade_levels where level = 6), 'Report Section', 'a6000000-0000-4000-8000-0000000000f1');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id, section_id, monitoring_status) values
  ('56000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-0000000000b1', 'LRN-600001',
   (select grade_id from app.grade_levels where level = 6), 'e6000000-0000-4000-8000-000000000001', 'needs_intervention'),
  ('56000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-0000000000b2', 'LRN-600002',
   (select grade_id from app.grade_levels where level = 6), 'e6000000-0000-4000-8000-000000000001', 'mastered');

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('c6000000-0000-4000-8000-000000000001', 'REPORT-COMP-1',
   (select grade_id from app.grade_levels where level = 6), 'Number Sense', 'Report competency', 'published');

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective, short_explanation, status, order_index)
values
  ('d6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
   'Report module', 20, 'Objective', 'Explanation', 'published', 1);

insert into app.competency_progress
  (student_id, competency_id, diagnostic_score, current_score, mastery_band, attempt_count, unsuccessful_attempts)
values
  ('56000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
   30.00, 40.00, 'Needs Improvement', 3, 3),
  ('56000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000001',
   70.00, 90.00, 'Mastered', 2, 0);

insert into app.student_module_progress
  (student_id, module_id, completion_percentage, is_complete, started_at, completed_at)
values
  ('56000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 50.00, false, now(), null),
  ('56000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000001', 100.00, true, now(), now());

insert into app.interventions
  (intervention_id, student_id, teacher_admin_id, competency_id, severity, intervention_type, educator_notes)
values
  ('16000000-0000-4000-8000-000000000001',
   '56000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-0000000000f1',
   'c6000000-0000-4000-8000-000000000001', 'HIGH', 'One-on-One Remediation', 'Private educator note');

insert into app.system_settings (setting_key, setting_value, updated_by) values
  ('thresholds.report_pass_percentage', '75'::jsonb, 'a6000000-0000-4000-8000-0000000000a1');

-- ===========================================================================
-- Anonymous callers
-- ===========================================================================
reset role;
set local request.jwt.claims = '';
set local role anon;

select throws_ok($$ select 1 from app.interventions $$,   '42501', null::text, 'An anonymous caller cannot read interventions');
select throws_ok($$ select 1 from app.system_settings $$, '42501', null::text, 'An anonymous caller cannot read system settings');
select throws_ok($$ select 1 from app.student_performance_summary $$, '42501', null::text, 'An anonymous caller cannot read the learner performance view');
select throws_ok($$ select 1 from app.competency_mastery_summary $$,  '42501', null::text, 'An anonymous caller cannot read the competency mastery view');
select throws_ok($$ select 1 from app.section_performance_summary $$, '42501', null::text, 'An anonymous caller cannot read the section view');
select throws_ok($$ select 1 from app.intervention_status_summary $$, '42501', null::text, 'An anonymous caller cannot read the intervention view');
select throws_ok($$ select 1 from app.teacher_dashboard_summary $$,   '42501', null::text, 'An anonymous caller cannot read the dashboard view');

-- ===========================================================================
-- A learner
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"b6000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select is_empty($$ select 1 from app.interventions
                   where interventions.intervention_id = '16000000-0000-4000-8000-000000000001' $$,
                'A learner cannot read the intervention recorded about them');

select is_empty($$ select 1 from app.system_settings
                   where system_settings.setting_key = 'thresholds.report_pass_percentage' $$,
                'A learner cannot read global configuration');

select throws_ok(
  $$ insert into app.interventions
       (student_id, teacher_admin_id, competency_id, severity, intervention_type)
     values ('56000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-0000000000f1',
             'c6000000-0000-4000-8000-000000000001', 'LOW', 'Other') $$,
  '42501', null::text, 'A learner cannot create an intervention');

select throws_ok(
  $$ insert into app.system_settings (setting_key, setting_value, updated_by)
     values ('thresholds.rogue', '1'::jsonb, 'b6000000-0000-4000-8000-0000000000b1') $$,
  '42501', null::text, 'A learner cannot create a system setting');

select throws_ok(
  $$ delete from app.interventions
     where interventions.intervention_id = '16000000-0000-4000-8000-000000000001' $$,
  '42501', null::text, 'A learner cannot delete an intervention');

-- A learner's update matches zero rows rather than raising, so the case is
-- re-read as the owner further below to prove it is untouched.
update app.interventions set status = 'Resolved', resolved_at = now(), educator_notes = 'Tampered'
where interventions.intervention_id = '16000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Reporting, as a learner
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from app.student_performance_summary
    where student_performance_summary.learner_id in ('LRN-600001', 'LRN-600002')),
  1::bigint,
  'A learner sees only their own row in the performance view'
);

select is(
  (select learner_id from app.student_performance_summary
    where student_performance_summary.learner_id in ('LRN-600001', 'LRN-600002')),
  'LRN-600001',
  'The performance row a learner sees is their own'
);

select is(
  (select current_average from app.student_performance_summary
    where student_performance_summary.learner_id = 'LRN-600001'),
  40.00::numeric,
  'A learner reads their own average, not the higher-scoring peer''s'
);

-- The safe subset: a learner learns nothing about the case recorded about them.
select is(
  (select open_intervention_count from app.student_performance_summary
    where student_performance_summary.learner_id = 'LRN-600001'),
  0::bigint,
  'A learner''s own performance row reveals no intervention recorded about them'
);

select is_empty($$ select 1 from app.intervention_status_summary $$,
                'A learner reads nothing from the intervention queue view');

select is(
  (select learner_count from app.teacher_dashboard_summary),
  1::bigint,
  'The dashboard view counts only the caller when the caller is a learner'
);

select is(
  (select open_intervention_count from app.teacher_dashboard_summary),
  0::bigint,
  'The dashboard view reveals no interventions to a learner'
);

select is(
  (select mastered_count from app.competency_mastery_summary
    where competency_mastery_summary.code = 'REPORT-COMP-1'),
  0::bigint,
  'A learner sees only their own contribution to a competency rollup'
);

select is(
  (select learner_count from app.section_performance_summary
    where section_performance_summary.section_id = 'e6000000-0000-4000-8000-000000000001'),
  1::bigint,
  'A learner sees only themselves in their own section rollup'
);

reset role;

select is(
  (select status from app.interventions
    where interventions.intervention_id = '16000000-0000-4000-8000-000000000001'),
  'Needs Intervention'::app.intervention_status,
  'A learner cannot resolve the intervention recorded about them'
);

select is(
  (select educator_notes from app.interventions
    where interventions.intervention_id = '16000000-0000-4000-8000-000000000001'),
  'Private educator note',
  'A learner cannot rewrite an educator''s notes'
);

-- ===========================================================================
-- A Teacher/Administrator
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"a6000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is(
  (select count(*) from app.interventions
    where interventions.intervention_id = '16000000-0000-4000-8000-000000000001'),
  1::bigint,
  'A teacher_admin reads intervention cases');

select is(
  (select setting_value from app.system_settings
    where system_settings.setting_key = 'thresholds.report_pass_percentage'),
  '75'::jsonb,
  'A teacher_admin reads global configuration');

-- Managing a case, each write proved by re-reading it.
insert into app.interventions
  (student_id, teacher_admin_id, competency_id, severity, intervention_type, educator_notes)
values
  ('56000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-0000000000f1',
   'c6000000-0000-4000-8000-000000000001', 'MEDIUM', 'Additional Exercise', 'Second case');

select is(
  (select count(*) from app.interventions
    where interventions.educator_notes = 'Second case'),
  1::bigint,
  'A teacher_admin can record an intervention for a learner and competency');

update app.interventions set status = 'In Progress'
where interventions.intervention_id = '16000000-0000-4000-8000-000000000001';

select is(
  (select status from app.interventions
    where interventions.intervention_id = '16000000-0000-4000-8000-000000000001'),
  'In Progress'::app.intervention_status,
  'A teacher_admin can advance a case');

update app.interventions set status = 'Resolved', resolved_at = now()
where interventions.intervention_id = '16000000-0000-4000-8000-000000000001';

select is(
  (select status from app.interventions
    where interventions.intervention_id = '16000000-0000-4000-8000-000000000001'),
  'Resolved'::app.intervention_status,
  'A teacher_admin can resolve a case');

update app.interventions set archived_at = now()
where interventions.intervention_id = '16000000-0000-4000-8000-000000000001';

select ok(
  (select archived_at is not null from app.interventions
    where interventions.intervention_id = '16000000-0000-4000-8000-000000000001'),
  'A teacher_admin can archive a case, and the record is retained');

update app.system_settings set setting_value = '80'::jsonb, updated_by = 'a6000000-0000-4000-8000-0000000000a1'
where system_settings.setting_key = 'thresholds.report_pass_percentage';

select is(
  (select setting_value from app.system_settings
    where system_settings.setting_key = 'thresholds.report_pass_percentage'),
  '80'::jsonb,
  'A teacher_admin can change a threshold');

select throws_ok(
  $$ delete from app.interventions
     where interventions.intervention_id = '16000000-0000-4000-8000-000000000001' $$,
  '42501', null::text,
  'A teacher_admin cannot delete a case; archiving keeps the audit trail');

select throws_ok(
  $$ insert into app.system_settings (setting_key, setting_value, updated_by)
     values ('features.groq_api_key', '"redacted"'::jsonb, 'a6000000-0000-4000-8000-0000000000a1') $$,
  '23514', null::text,
  'Even a teacher_admin cannot store a credential in system settings');

-- ---------------------------------------------------------------------------
-- Reporting, as a Teacher/Administrator
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from app.student_performance_summary
    where student_performance_summary.learner_id in ('LRN-600001', 'LRN-600002')),
  2::bigint,
  'A teacher_admin sees the cohort in the performance view');

select is(
  (select mastered_count from app.competency_mastery_summary
    where competency_mastery_summary.code = 'REPORT-COMP-1'),
  1::bigint,
  'A teacher_admin sees the full mastery distribution for a competency');

select is(
  (select needs_improvement_count from app.competency_mastery_summary
    where competency_mastery_summary.code = 'REPORT-COMP-1'),
  1::bigint,
  'The competency rollup counts every band');

select is(
  (select learner_count from app.section_performance_summary
    where section_performance_summary.section_id = 'e6000000-0000-4000-8000-000000000001'),
  2::bigint,
  'A teacher_admin sees the whole section in the section rollup');

select is(
  (select needs_intervention_count from app.section_performance_summary
    where section_performance_summary.section_id = 'e6000000-0000-4000-8000-000000000001'),
  1::bigint,
  'The section rollup surfaces learners needing support');

select isnt_empty($$ select 1 from app.intervention_status_summary $$,
                  'A teacher_admin reads the intervention queue view');

select is(
  (select learner_count from app.teacher_dashboard_summary),
  2::bigint,
  'The dashboard view counts the cohort for a teacher_admin');

select is(
  (select open_intervention_count from app.teacher_dashboard_summary),
  1::bigint,
  'The dashboard view counts open cases, excluding the resolved and archived one');

-- ===========================================================================
-- Untrusted claims
-- ===========================================================================
reset role;
set local request.jwt.claims = '{"sub":"b6000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"},"user_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is_empty($$ select 1 from app.interventions $$,
                'A teacher_admin role in user_metadata does not reveal interventions');

select is_empty($$ select 1 from app.system_settings $$,
                'A teacher_admin role in user_metadata does not reveal configuration');

select is(
  (select count(*) from app.student_performance_summary
    where student_performance_summary.learner_id in ('LRN-600001', 'LRN-600002')),
  1::bigint,
  'A teacher_admin role in user_metadata does not widen a reporting view');

reset role;

select * from finish();

rollback;
