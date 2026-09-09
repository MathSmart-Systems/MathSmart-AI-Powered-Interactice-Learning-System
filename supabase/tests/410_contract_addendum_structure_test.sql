-- MathSmart Phase 5a — structural verification of the API contract addendum.
--
-- The properties that matter here: the audit trail is append-only for every
-- role including the backend, replay protection is unreachable from the Data
-- API, an activity attempt can now exist before it is submitted, and the
-- accessible visual-aid description joined the readable question columns
-- without disturbing the three server-only ones.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- New entities
-- ---------------------------------------------------------------------------
select has_table('app'::name, 'audit_events'::name,               'app.audit_events exists');
select has_table('app'::name, 'idempotency_keys'::name,           'app.idempotency_keys exists');
select has_table('app'::name, 'activity_responses'::name,         'app.activity_responses exists');
select has_table('app'::name, 'reassessment_authorizations'::name,'app.reassessment_authorizations exists');

select has_column('app'::name, 'audit_events'::name, 'actor_user_id'::name, 'app.audit_events.actor_user_id exists');
select has_column('app'::name, 'audit_events'::name, 'action'::name,        'app.audit_events.action exists');
select has_column('app'::name, 'audit_events'::name, 'target_type'::name,   'app.audit_events.target_type exists');
select has_column('app'::name, 'audit_events'::name, 'target_id'::name,     'app.audit_events.target_id exists');
select has_column('app'::name, 'audit_events'::name, 'request_id'::name,    'app.audit_events.request_id exists');
select has_column('app'::name, 'audit_events'::name, 'occurred_at'::name,   'app.audit_events.occurred_at exists');

select has_column('app'::name, 'reassessment_authorizations'::name, 'reason'::name,        'app.reassessment_authorizations.reason exists');
select has_column('app'::name, 'reassessment_authorizations'::name, 'authorized_by'::name, 'app.reassessment_authorizations.authorized_by exists');
select has_column('app'::name, 'reassessment_authorizations'::name, 'consumed_at'::name,   'app.reassessment_authorizations.consumed_at exists');

select has_column('app'::name, 'activity_responses'::name, 'check_count'::name,    'app.activity_responses.check_count exists');
select has_column('app'::name, 'activity_responses'::name, 'hint_issued_at'::name, 'app.activity_responses.hint_issued_at exists');

-- ---------------------------------------------------------------------------
-- New columns the contract returns or filters on
-- ---------------------------------------------------------------------------
select has_column('app'::name, 'activity_attempts'::name, 'status'::name,           'app.activity_attempts.status exists');
select has_column('app'::name, 'activity_attempts'::name, 'started_at'::name,       'app.activity_attempts.started_at exists');
select has_column('app'::name, 'activity_attempts'::name, 'raw_score'::name,        'app.activity_attempts.raw_score exists');
select has_column('app'::name, 'activity_attempts'::name, 'max_score'::name,        'app.activity_attempts.max_score exists');
select has_column('app'::name, 'activity_attempts'::name, 'activity_version'::name, 'app.activity_attempts.activity_version exists');

select has_column('app'::name, 'assessment_attempts'::name, 'assessment_version'::name, 'app.assessment_attempts.assessment_version exists');
select has_column('app'::name, 'assessment_attempts'::name, 'voided_reason'::name,      'app.assessment_attempts.voided_reason exists');
select has_column('app'::name, 'assessment_attempts'::name, 'voided_by'::name,          'app.assessment_attempts.voided_by exists');
select has_column('app'::name, 'assessment_responses'::name, 'question_version'::name,  'app.assessment_responses.question_version exists');

select has_column('app'::name, 'assessments'::name, 'description'::name,             'app.assessments.description exists');
select has_column('app'::name, 'questions'::name, 'visual_aid_description'::name,    'app.questions.visual_aid_description exists');
select has_column('app'::name, 'user_profiles'::name, 'account_status'::name,        'app.user_profiles.account_status exists');
select has_column('app'::name, 'user_profiles'::name, 'preferences'::name,           'app.user_profiles.preferences exists');
select has_column('app'::name, 'student_profiles'::name, 'diagnostic_status'::name,  'app.student_profiles.diagnostic_status exists');
select has_column('app'::name, 'student_profiles'::name, 'school_name'::name,        'app.student_profiles.school_name exists');
select has_column('app'::name, 'student_module_progress'::name, 'completed_section_ids'::name, 'app.student_module_progress.completed_section_ids exists');
select has_column('app'::name, 'student_module_progress'::name, 'last_section_id'::name,       'app.student_module_progress.last_section_id exists');
select has_column('app'::name, 'interventions'::name, 'ai_model'::name,              'app.interventions.ai_model exists');
select has_column('app'::name, 'interventions'::name, 'ai_confidence_score'::name,   'app.interventions.ai_confidence_score exists');
select has_column('app'::name, 'interventions'::name, 'ai_generated_at'::name,       'app.interventions.ai_generated_at exists');
select has_column('app'::name, 'interventions'::name, 'reopen_reason'::name,         'app.interventions.reopen_reason exists');

-- ---------------------------------------------------------------------------
-- New vocabularies
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(value_row::text, ',' order by value_row::text)
   from unnest(enum_range(null::app.diagnostic_status)) as value_row),
  'completed,in_progress,not_started',
  'app.diagnostic_status carries the canonical values from the frozen enum table'
);

select is(
  (select string_agg(value_row::text, ',' order by value_row::text)
   from unnest(enum_range(null::app.account_status)) as value_row),
  'active,archived,suspended',
  'app.account_status carries the account states user administration needs'
);

-- ---------------------------------------------------------------------------
-- The audit trail is append-only for everyone, including the backend
-- ---------------------------------------------------------------------------
select ok(has_table_privilege('service_role', 'app.audit_events'::regclass, 'insert'),
          'service_role can write an audit record');
select ok(not has_table_privilege('service_role', 'app.audit_events'::regclass, 'update'),
          'Not even service_role can alter an audit record');
select ok(not has_table_privilege('service_role', 'app.audit_events'::regclass, 'delete'),
          'Not even service_role can erase an audit record');
select ok(not has_any_column_privilege('authenticated', 'app.audit_events'::regclass, 'insert'),
          'authenticated cannot write an audit record');
select ok(not has_any_column_privilege('anon', 'app.audit_events'::regclass, 'select'),
          'anon cannot read the audit trail');

-- ---------------------------------------------------------------------------
-- Replay protection is infrastructure, not application data
-- ---------------------------------------------------------------------------
select ok(not has_any_column_privilege('authenticated', 'app.idempotency_keys'::regclass, 'select'),
          'authenticated cannot read stored idempotent responses');
select ok(not has_any_column_privilege('anon', 'app.idempotency_keys'::regclass, 'select'),
          'anon cannot read stored idempotent responses');
select ok(has_table_privilege('service_role', 'app.idempotency_keys'::regclass, 'insert'),
          'service_role records idempotency keys');

-- ---------------------------------------------------------------------------
-- Answer-key confidentiality survives the new question column
-- ---------------------------------------------------------------------------
select ok(has_column_privilege('authenticated', 'app.questions'::regclass, 'visual_aid_description'::text, 'select'),
          'authenticated can read the accessible visual-aid description, which describes the question rather than the answer');
select ok(not has_column_privilege('authenticated', 'app.questions'::regclass, 'answer_key'::text, 'select'),
          'authenticated still cannot read app.questions.answer_key');
select ok(not has_column_privilege('authenticated', 'app.questions'::regclass, 'explanation'::text, 'select'),
          'authenticated still cannot read app.questions.explanation');
select ok(not has_column_privilege('authenticated', 'app.questions'::regclass, 'hint'::text, 'select'),
          'authenticated still cannot read app.questions.hint');

-- ---------------------------------------------------------------------------
-- Learner records stay read-only through the Data API roles
-- ---------------------------------------------------------------------------
select ok(not has_any_column_privilege('authenticated', 'app.activity_attempts'::regclass, 'insert'),
          'authenticated still cannot insert an activity attempt');
select ok(not has_any_column_privilege('authenticated', 'app.activity_attempts'::regclass, 'update'),
          'authenticated still cannot update an activity attempt');
select ok(not has_any_column_privilege('authenticated', 'app.activity_responses'::regclass, 'insert'),
          'authenticated cannot insert an activity response');
select ok(not has_any_column_privilege('authenticated', 'app.reassessment_authorizations'::regclass, 'insert'),
          'authenticated cannot grant itself a reassessment');
select ok(has_table_privilege('service_role', 'app.reassessment_authorizations'::regclass, 'insert'),
          'service_role records an audited reassessment authorization');

-- A learner may set their own display preferences, and nothing else new.
select ok(has_column_privilege('authenticated', 'app.user_profiles'::regclass, 'preferences'::text, 'update'),
          'authenticated may update its own display preferences');
select ok(not has_column_privilege('authenticated', 'app.user_profiles'::regclass, 'account_status'::text, 'update'),
          'authenticated cannot change an account status; that is an audited backend workflow');

-- ---------------------------------------------------------------------------
-- Row Level Security and reporting
-- ---------------------------------------------------------------------------
select ok(
  (select bool_and(pg_class.relrowsecurity)
   from pg_class
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'app'
     and pg_class.relkind = 'r'),
  'Row Level Security is enabled on every table in the app schema, including the four new ones'
);

select is(
  (select count(*)
   from pg_class
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'app'
     and pg_class.relkind = 'v'
     and not ('security_invoker=true' = any (coalesce(pg_class.reloptions, array[]::text[])))),
  0::bigint,
  'Every view in the app schema is still security_invoker after the performance view was recreated'
);

select has_column('app'::name, 'student_performance_summary'::name, 'diagnostic_status'::name,
                  'The learner performance view now carries diagnostic_status, as the learner summary shape requires');

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
-- Indexes the contract's filters and gates need
-- ---------------------------------------------------------------------------
select ok(to_regclass('app.activity_attempts_one_in_progress_key') is not null,
          'At most one activity attempt per learner and activity may be in progress');
select ok(to_regclass('app.reassessment_authorizations_one_open_key') is not null,
          'At most one unspent reassessment authorization per learner and assessment');
select ok(to_regclass('app.student_profiles_diagnostic_status_idx') is not null,
          'The documented roster filter on diagnostic status is indexed');
select ok(to_regclass('app.audit_events_target_idx') is not null,   'Audit history is indexed by target');
select ok(to_regclass('app.audit_events_actor_idx') is not null,    'Audit history is indexed by actor');
select ok(to_regclass('app.audit_events_request_idx') is not null,  'Audit history is indexed by request id');
select ok(to_regclass('app.activity_responses_question_idx') is not null,
          'The activity response question foreign key is indexed');

-- ---------------------------------------------------------------------------
-- Helper hardening is unchanged
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

select * from finish();

rollback;
