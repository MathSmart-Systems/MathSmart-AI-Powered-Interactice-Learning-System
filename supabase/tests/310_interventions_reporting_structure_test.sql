-- MathSmart Phase 4 — structural verification of interventions, settings and
-- reporting.
--
-- The reporting assertions are the important ones: every view must be
-- security_invoker, or it would run with the migration owner's rights and hand
-- out exactly the rows the base-table policies exist to withhold.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Entities
-- ---------------------------------------------------------------------------
select has_table('app'::name, 'interventions'::name,   'app.interventions exists');
select has_table('app'::name, 'system_settings'::name, 'app.system_settings exists');

select has_column('app'::name, 'interventions'::name, 'intervention_id'::name,    'app.interventions.intervention_id exists');
select has_column('app'::name, 'interventions'::name, 'student_id'::name,         'app.interventions.student_id exists');
select has_column('app'::name, 'interventions'::name, 'teacher_admin_id'::name,   'app.interventions.teacher_admin_id exists');
select has_column('app'::name, 'interventions'::name, 'competency_id'::name,      'app.interventions.competency_id exists');
select has_column('app'::name, 'interventions'::name, 'severity'::name,           'app.interventions.severity exists');
select has_column('app'::name, 'interventions'::name, 'status'::name,             'app.interventions.status exists');
select has_column('app'::name, 'interventions'::name, 'intervention_type'::name,  'app.interventions.intervention_type exists');
select has_column('app'::name, 'interventions'::name, 'incorrect_patterns'::name, 'app.interventions.incorrect_patterns exists');
select has_column('app'::name, 'interventions'::name, 'modules_attempted'::name,  'app.interventions.modules_attempted exists');
select has_column('app'::name, 'interventions'::name, 'ai_insight'::name,         'app.interventions.ai_insight exists');
select has_column('app'::name, 'interventions'::name, 'ai_recommendation'::name,  'app.interventions.ai_recommendation exists');
select has_column('app'::name, 'interventions'::name, 'educator_notes'::name,     'app.interventions.educator_notes exists');
select has_column('app'::name, 'interventions'::name, 'created_at'::name,         'app.interventions.created_at exists');
select has_column('app'::name, 'interventions'::name, 'recorded_at'::name,        'app.interventions.recorded_at exists');
select has_column('app'::name, 'interventions'::name, 'resolved_at'::name,        'app.interventions.resolved_at exists');
select has_column('app'::name, 'interventions'::name, 'archived_at'::name,        'app.interventions.archived_at exists');

select has_column('app'::name, 'system_settings'::name, 'setting_key'::name,   'app.system_settings.setting_key exists');
select has_column('app'::name, 'system_settings'::name, 'setting_value'::name, 'app.system_settings.setting_value exists');
select has_column('app'::name, 'system_settings'::name, 'updated_by'::name,    'app.system_settings.updated_by exists');
select has_column('app'::name, 'system_settings'::name, 'updated_at'::name,    'app.system_settings.updated_at exists');

select col_is_pk('app'::name, 'interventions'::name,   'intervention_id'::name, 'app.interventions is keyed by intervention_id');
select col_is_pk('app'::name, 'system_settings'::name, 'setting_key'::name,     'app.system_settings is keyed by setting_key');

-- The advisory fields must be optional, or a case could not exist without Groq.
select col_is_null('app'::name, 'interventions'::name, 'ai_insight'::name,
                   'app.interventions.ai_insight is optional, so a case survives Groq being unavailable');
select col_is_null('app'::name, 'interventions'::name, 'ai_recommendation'::name,
                   'app.interventions.ai_recommendation is optional');

-- ---------------------------------------------------------------------------
-- Controlled vocabularies
-- ---------------------------------------------------------------------------
-- Exact equality, and exact casing: the canonical table is upper case for
-- severity and Title Case with spaces for status and type.
select is(
  (select string_agg(severity_value::text, ',' order by severity_value::text)
   from unnest(enum_range(null::app.intervention_severity)) as severity_value),
  'HIGH,LOW,MEDIUM',
  'app.intervention_severity carries the canonical severities in upper case'
);

select is(
  (select string_agg(status_value::text, ',' order by status_value::text)
   from unnest(enum_range(null::app.intervention_status)) as status_value),
  'In Progress,Needs Intervention,Resolved',
  'app.intervention_status carries the canonical lifecycle in its canonical casing'
);

select is(
  (select string_agg(type_value::text, ',' order by type_value::text)
   from unnest(enum_range(null::app.intervention_type)) as type_value),
  'Additional Exercise,Additional Module,One-on-One Remediation,Other,Teacher Consultation',
  'app.intervention_type carries the canonical typed actions'
);

-- ---------------------------------------------------------------------------
-- Reporting views
-- ---------------------------------------------------------------------------
select has_view('app'::name, 'student_performance_summary'::name, 'app.student_performance_summary exists');
select has_view('app'::name, 'competency_mastery_summary'::name,  'app.competency_mastery_summary exists');
select has_view('app'::name, 'section_performance_summary'::name, 'app.section_performance_summary exists');
select has_view('app'::name, 'intervention_status_summary'::name, 'app.intervention_status_summary exists');
select has_view('app'::name, 'teacher_dashboard_summary'::name,   'app.teacher_dashboard_summary exists');

-- Every view in the schema must run with the caller's rights, not the owner's.
-- A view that misses this hands out every row its base tables' policies were
-- meant to withhold.
select is(
  (select count(*)
   from pg_class
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'app'
     and pg_class.relkind = 'v'
     and not ('security_invoker=true' = any (coalesce(pg_class.reloptions, array[]::text[])))),
  0::bigint,
  'Every view in the app schema is security_invoker'
);

select is(
  (select count(*)
   from pg_class
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'app'
     and pg_class.relkind = 'v'),
  5::bigint,
  'The app schema exposes exactly the five reporting views'
);

-- No reporting view may read the question bank, which is where answer keys live.
select is(
  (select count(*)
   from pg_depend
   join pg_rewrite on pg_rewrite.oid = pg_depend.objid
   join pg_class as view_class on view_class.oid = pg_rewrite.ev_class
   join pg_namespace on pg_namespace.oid = view_class.relnamespace
   where pg_namespace.nspname = 'app'
     and view_class.relkind = 'v'
     and pg_depend.refobjid = 'app.questions'::regclass
     and pg_depend.classid = 'pg_rewrite'::regclass),
  0::bigint,
  'No reporting view depends on app.questions, so no answer key can leak through reporting'
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
select ok(
  (select bool_and(pg_class.relrowsecurity)
   from pg_class
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'app'
     and pg_class.relkind = 'r'),
  'Row Level Security is still enabled on every table in the app schema'
);

select ok(
  (select count(*)
   from pg_policy
   join pg_class on pg_class.oid = pg_policy.polrelid
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'app'
     and pg_class.relname in ('interventions', 'system_settings')) >= 6,
  'Interventions and system settings carry policies for the commands they expose'
);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(not has_schema_privilege('anon', 'app', 'usage'), 'anon still has no USAGE on the app schema');

select ok(not has_any_column_privilege('anon', 'app.interventions'::regclass, 'select'),   'anon cannot select interventions');
select ok(not has_any_column_privilege('anon', 'app.system_settings'::regclass, 'select'), 'anon cannot select system settings');
select ok(not has_table_privilege('anon', 'app.student_performance_summary'::regclass, 'select'), 'anon cannot select the learner performance view');
select ok(not has_table_privilege('anon', 'app.teacher_dashboard_summary'::regclass, 'select'),   'anon cannot select the dashboard view');
select ok(not has_table_privilege('anon', 'app.intervention_status_summary'::regclass, 'select'), 'anon cannot select the intervention view');

-- Cases and settings are archived or superseded, never deleted.
select ok(not has_table_privilege('authenticated', 'app.interventions'::regclass, 'delete'),
          'authenticated cannot delete an intervention; cases are archived so the audit trail survives');
select ok(not has_table_privilege('authenticated', 'app.system_settings'::regclass, 'delete'),
          'authenticated cannot delete a system setting');

-- Identifiers stay server-generated.
select ok(not has_column_privilege('authenticated', 'app.interventions'::regclass, 'intervention_id'::text, 'insert'),
          'authenticated cannot choose an intervention identifier');
select ok(has_column_privilege('authenticated', 'app.interventions'::regclass, 'educator_notes'::text, 'update'),
          'authenticated may record educator notes, subject to policy');
select ok(has_column_privilege('authenticated', 'app.interventions'::regclass, 'status'::text, 'update'),
          'authenticated may advance a case status, subject to policy');

-- The audit column on settings cannot be edited away.
select ok(has_column_privilege('authenticated', 'app.system_settings'::regclass, 'updated_by'::text, 'update'),
          'authenticated must supply the Teacher/Administrator making a settings change');
select ok(not has_column_privilege('authenticated', 'app.system_settings'::regclass, 'setting_key'::text, 'update'),
          'authenticated cannot rename a setting key in place');

select ok(has_table_privilege('authenticated', 'app.student_performance_summary'::regclass, 'select'),
          'authenticated may read the learner performance view, subject to base-table policy');
select ok(has_table_privilege('service_role', 'app.teacher_dashboard_summary'::regclass, 'select'),
          'service_role may read the dashboard view');

-- ---------------------------------------------------------------------------
-- Helper hardening
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER remains the rule. Where a function must run with definer
-- rights — because it reads a column or writes a table the caller deliberately
-- cannot — the hardening is what makes it safe, so that is what is asserted
-- here. The reviewed list of names lives in 010_foundation_structure_test.sql.
select is(
  (select count(*)
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.prosecdef
     and (pg_proc.proconfig is null
          or not (pg_proc.proconfig::text like '%search_path%'))),
  0::bigint,
  'Every SECURITY DEFINER function in app pins its search_path'
);

select is(
  (select count(*)
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.prosecdef
     and has_function_privilege('anon', pg_proc.oid, 'execute')),
  0::bigint,
  'No SECURITY DEFINER function in app is executable by anon'
);

select ok(
  (select bool_and(pg_proc.proconfig::text like '%search_path%')
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'),
  'Every function in the app schema pins its search_path'
);

-- ---------------------------------------------------------------------------
-- Indexes for reporting filters and joins
-- ---------------------------------------------------------------------------
select ok(to_regclass('app.interventions_student_status_idx') is not null, 'Interventions are indexed by learner and status');
select ok(to_regclass('app.interventions_status_idx') is not null,        'Interventions are indexed by status');
select ok(to_regclass('app.interventions_severity_idx') is not null,      'Interventions are indexed by severity');
select ok(to_regclass('app.interventions_competency_idx') is not null,    'Interventions are indexed by competency');
select ok(to_regclass('app.interventions_teacher_admin_idx') is not null, 'Interventions are indexed by owning educator');
select ok(to_regclass('app.interventions_open_queue_idx') is not null,    'The open intervention queue is indexed');
select ok(to_regclass('app.system_settings_updated_by_idx') is not null,  'System settings are indexed by the educator who changed them');

select * from finish();

rollback;
