-- MathSmart Phase 3 — structural verification of the learner-record schema.
--
-- Covers the entities, the vocabularies, the deterministic derivation
-- functions, RLS enablement, and the privilege boundary that makes these seven
-- tables read-only through the Data API roles.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Entities
-- ---------------------------------------------------------------------------
select has_table('app'::name, 'assessment_attempts'::name,     'app.assessment_attempts exists');
select has_table('app'::name, 'assessment_responses'::name,    'app.assessment_responses exists');
select has_table('app'::name, 'competency_results'::name,      'app.competency_results exists');
select has_table('app'::name, 'learning_path_items'::name,     'app.learning_path_items exists');
select has_table('app'::name, 'student_module_progress'::name, 'app.student_module_progress exists');
select has_table('app'::name, 'activity_attempts'::name,       'app.activity_attempts exists');
select has_table('app'::name, 'competency_progress'::name,     'app.competency_progress exists');

-- ---------------------------------------------------------------------------
-- Canonical columns
-- ---------------------------------------------------------------------------
select has_column('app'::name, 'assessment_attempts'::name, 'attempt_id'::name,    'app.assessment_attempts.attempt_id exists');
select has_column('app'::name, 'assessment_attempts'::name, 'assessment_id'::name, 'app.assessment_attempts.assessment_id exists');
select has_column('app'::name, 'assessment_attempts'::name, 'student_id'::name,    'app.assessment_attempts.student_id exists');
select has_column('app'::name, 'assessment_attempts'::name, 'status'::name,        'app.assessment_attempts.status exists');
select has_column('app'::name, 'assessment_attempts'::name, 'overall_score'::name, 'app.assessment_attempts.overall_score exists');
select has_column('app'::name, 'assessment_attempts'::name, 'started_at'::name,    'app.assessment_attempts.started_at exists');
select has_column('app'::name, 'assessment_attempts'::name, 'submitted_at'::name,  'app.assessment_attempts.submitted_at exists');

select has_column('app'::name, 'assessment_responses'::name, 'response_id'::name, 'app.assessment_responses.response_id exists');
select has_column('app'::name, 'assessment_responses'::name, 'attempt_id'::name,  'app.assessment_responses.attempt_id exists');
select has_column('app'::name, 'assessment_responses'::name, 'question_id'::name, 'app.assessment_responses.question_id exists');
select has_column('app'::name, 'assessment_responses'::name, 'answer'::name,      'app.assessment_responses.answer exists');
select has_column('app'::name, 'assessment_responses'::name, 'is_correct'::name,  'app.assessment_responses.is_correct exists');

select has_column('app'::name, 'competency_results'::name, 'result_id'::name,     'app.competency_results.result_id exists');
select has_column('app'::name, 'competency_results'::name, 'attempt_id'::name,    'app.competency_results.attempt_id exists');
select has_column('app'::name, 'competency_results'::name, 'competency_id'::name, 'app.competency_results.competency_id exists');
select has_column('app'::name, 'competency_results'::name, 'raw_score'::name,     'app.competency_results.raw_score exists');
select has_column('app'::name, 'competency_results'::name, 'max_score'::name,     'app.competency_results.max_score exists');
select has_column('app'::name, 'competency_results'::name, 'percentage'::name,    'app.competency_results.percentage exists');
select has_column('app'::name, 'competency_results'::name, 'mastery_band'::name,  'app.competency_results.mastery_band exists');

select has_column('app'::name, 'learning_path_items'::name, 'path_item_id'::name,  'app.learning_path_items.path_item_id exists');
select has_column('app'::name, 'learning_path_items'::name, 'student_id'::name,    'app.learning_path_items.student_id exists');
select has_column('app'::name, 'learning_path_items'::name, 'competency_id'::name, 'app.learning_path_items.competency_id exists');
select has_column('app'::name, 'learning_path_items'::name, 'module_id'::name,     'app.learning_path_items.module_id exists');
select has_column('app'::name, 'learning_path_items'::name, 'priority'::name,      'app.learning_path_items.priority exists');
select has_column('app'::name, 'learning_path_items'::name, 'reason'::name,        'app.learning_path_items.reason exists');
select has_column('app'::name, 'learning_path_items'::name, 'status'::name,        'app.learning_path_items.status exists');

select has_column('app'::name, 'student_module_progress'::name, 'progress_id'::name,           'app.student_module_progress.progress_id exists');
select has_column('app'::name, 'student_module_progress'::name, 'student_id'::name,            'app.student_module_progress.student_id exists');
select has_column('app'::name, 'student_module_progress'::name, 'module_id'::name,             'app.student_module_progress.module_id exists');
select has_column('app'::name, 'student_module_progress'::name, 'completion_percentage'::name, 'app.student_module_progress.completion_percentage exists');
select has_column('app'::name, 'student_module_progress'::name, 'is_complete'::name,           'app.student_module_progress.is_complete exists');
select has_column('app'::name, 'student_module_progress'::name, 'started_at'::name,            'app.student_module_progress.started_at exists');
select has_column('app'::name, 'student_module_progress'::name, 'completed_at'::name,          'app.student_module_progress.completed_at exists');

select has_column('app'::name, 'activity_attempts'::name, 'attempt_id'::name,         'app.activity_attempts.attempt_id exists');
select has_column('app'::name, 'activity_attempts'::name, 'student_id'::name,         'app.activity_attempts.student_id exists');
select has_column('app'::name, 'activity_attempts'::name, 'activity_id'::name,        'app.activity_attempts.activity_id exists');
select has_column('app'::name, 'activity_attempts'::name, 'attempt_number'::name,     'app.activity_attempts.attempt_number exists');
select has_column('app'::name, 'activity_attempts'::name, 'score_percentage'::name,   'app.activity_attempts.score_percentage exists');
select has_column('app'::name, 'activity_attempts'::name, 'time_spent_seconds'::name, 'app.activity_attempts.time_spent_seconds exists');
select has_column('app'::name, 'activity_attempts'::name, 'passed'::name,             'app.activity_attempts.passed exists');
select has_column('app'::name, 'activity_attempts'::name, 'mastery_status'::name,     'app.activity_attempts.mastery_status exists');
select has_column('app'::name, 'activity_attempts'::name, 'submitted_at'::name,       'app.activity_attempts.submitted_at exists');

select has_column('app'::name, 'competency_progress'::name, 'progress_id'::name,           'app.competency_progress.progress_id exists');
select has_column('app'::name, 'competency_progress'::name, 'student_id'::name,            'app.competency_progress.student_id exists');
select has_column('app'::name, 'competency_progress'::name, 'competency_id'::name,         'app.competency_progress.competency_id exists');
select has_column('app'::name, 'competency_progress'::name, 'diagnostic_score'::name,      'app.competency_progress.diagnostic_score exists');
select has_column('app'::name, 'competency_progress'::name, 'current_score'::name,         'app.competency_progress.current_score exists');
select has_column('app'::name, 'competency_progress'::name, 'mastery_band'::name,          'app.competency_progress.mastery_band exists');
select has_column('app'::name, 'competency_progress'::name, 'attempt_count'::name,         'app.competency_progress.attempt_count exists');
select has_column('app'::name, 'competency_progress'::name, 'unsuccessful_attempts'::name, 'app.competency_progress.unsuccessful_attempts exists');
select has_column('app'::name, 'competency_progress'::name, 'last_studied_at'::name,       'app.competency_progress.last_studied_at exists');

-- ---------------------------------------------------------------------------
-- Keys
-- ---------------------------------------------------------------------------
select col_is_pk('app'::name, 'assessment_attempts'::name,     'attempt_id'::name,   'app.assessment_attempts is keyed by attempt_id');
select col_is_pk('app'::name, 'assessment_responses'::name,    'response_id'::name,  'app.assessment_responses is keyed by response_id');
select col_is_pk('app'::name, 'competency_results'::name,      'result_id'::name,    'app.competency_results is keyed by result_id');
select col_is_pk('app'::name, 'learning_path_items'::name,     'path_item_id'::name, 'app.learning_path_items is keyed by path_item_id');
select col_is_pk('app'::name, 'student_module_progress'::name, 'progress_id'::name,  'app.student_module_progress is keyed by progress_id');
select col_is_pk('app'::name, 'activity_attempts'::name,       'attempt_id'::name,   'app.activity_attempts is keyed by attempt_id');
select col_is_pk('app'::name, 'competency_progress'::name,     'progress_id'::name,  'app.competency_progress is keyed by progress_id');

-- ---------------------------------------------------------------------------
-- Controlled vocabularies
-- ---------------------------------------------------------------------------
-- Exact equality on purpose, as in the earlier phases: these values come from
-- the frozen canonical enum table.
select is(
  (select string_agg(status_value::text, ',' order by status_value::text)
   from unnest(enum_range(null::app.attempt_status)) as status_value),
  'in_progress,scored,submitted,voided',
  'app.attempt_status carries the canonical attempt lifecycle'
);

select is(
  (select string_agg(band_value::text, ',' order by band_value::text)
   from unnest(enum_range(null::app.mastery_band)) as band_value),
  'Developing,Mastered,Needs Improvement',
  'app.mastery_band carries the canonical display bands, in their canonical casing'
);

select is(
  (select string_agg(path_value::text, ',' order by path_value::text)
   from unnest(enum_range(null::app.path_item_status)) as path_value),
  'available,completed,in_progress,locked',
  'app.path_item_status carries the canonical learning-path states'
);

-- ---------------------------------------------------------------------------
-- Deterministic derivations
-- ---------------------------------------------------------------------------
select is(app.percentage_for(7, 10),  70.00::numeric, 'A percentage is raw over max, as a percentage');
select is(app.percentage_for(0, 10),   0.00::numeric, 'A zero raw score is zero percent');
select is(app.percentage_for(10, 10), 100.00::numeric, 'A full raw score is one hundred percent');
select is(app.percentage_for(1, 3),   33.33::numeric, 'A repeating percentage is rounded to two places');

select is(app.mastery_band_for(100), 'Mastered'::app.mastery_band,          'One hundred percent is Mastered');
select is(app.mastery_band_for(80),  'Mastered'::app.mastery_band,          'Eighty percent is the bottom of Mastered');
select is(app.mastery_band_for(79.99), 'Developing'::app.mastery_band,      'Just under eighty is Developing');
select is(app.mastery_band_for(50),  'Developing'::app.mastery_band,        'Fifty percent is the bottom of Developing');
select is(app.mastery_band_for(49.99), 'Needs Improvement'::app.mastery_band, 'Just under fifty is Needs Improvement');
select is(app.mastery_band_for(0),   'Needs Improvement'::app.mastery_band, 'Zero percent is Needs Improvement');
select is(app.mastery_band_for(null), null::app.mastery_band,               'No score yields no band');

-- The derivations must be IMMUTABLE, or they could not back a CHECK constraint.
select is(
  (select string_agg(pg_proc.proname, ',' order by pg_proc.proname)
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.proname in ('percentage_for', 'mastery_band_for')
     and pg_proc.provolatile = 'i'),
  'mastery_band_for,percentage_for',
  'Both deterministic derivations are IMMUTABLE'
);

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

select ok(not has_function_privilege('anon', 'app.current_student_id()', 'execute'),
          'anon cannot execute app.current_student_id()');

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
     and pg_class.relname in ('assessment_attempts', 'assessment_responses', 'competency_results',
                              'learning_path_items', 'student_module_progress',
                              'activity_attempts', 'competency_progress')) >= 7,
  'Every learner-record table carries a policy'
);

-- ---------------------------------------------------------------------------
-- Anonymous callers reach no learner evidence
-- ---------------------------------------------------------------------------
select ok(not has_any_column_privilege('anon', 'app.assessment_attempts'::regclass, 'select'),     'anon cannot select assessment attempts');
select ok(not has_any_column_privilege('anon', 'app.assessment_responses'::regclass, 'select'),    'anon cannot select assessment responses');
select ok(not has_any_column_privilege('anon', 'app.competency_results'::regclass, 'select'),      'anon cannot select competency results');
select ok(not has_any_column_privilege('anon', 'app.learning_path_items'::regclass, 'select'),     'anon cannot select learning path items');
select ok(not has_any_column_privilege('anon', 'app.student_module_progress'::regclass, 'select'), 'anon cannot select module progress');
select ok(not has_any_column_privilege('anon', 'app.activity_attempts'::regclass, 'select'),       'anon cannot select activity attempts');
select ok(not has_any_column_privilege('anon', 'app.competency_progress'::regclass, 'select'),     'anon cannot select competency progress');

-- ---------------------------------------------------------------------------
-- Learner evidence is read-only through the Data API roles
-- ---------------------------------------------------------------------------
-- Every value in these tables is calculated by deterministic application code,
-- so no Data API role may write one. This is the assertion that keeps an
-- official score, band or progress figure out of client reach.
select ok(has_table_privilege('authenticated', 'app.assessment_attempts'::regclass, 'select'),
          'authenticated may read assessment attempts, subject to policy');

select ok(not has_any_column_privilege('authenticated', 'app.assessment_attempts'::regclass, 'insert'),     'authenticated cannot insert an assessment attempt');
select ok(not has_any_column_privilege('authenticated', 'app.assessment_attempts'::regclass, 'update'),     'authenticated cannot update an assessment attempt');
select ok(not has_table_privilege('authenticated', 'app.assessment_attempts'::regclass, 'delete'),          'authenticated cannot delete an assessment attempt');

select ok(not has_any_column_privilege('authenticated', 'app.assessment_responses'::regclass, 'insert'),    'authenticated cannot insert an assessment response');
select ok(not has_any_column_privilege('authenticated', 'app.assessment_responses'::regclass, 'update'),    'authenticated cannot update an assessment response');
select ok(not has_table_privilege('authenticated', 'app.assessment_responses'::regclass, 'delete'),         'authenticated cannot delete an assessment response');

select ok(not has_any_column_privilege('authenticated', 'app.competency_results'::regclass, 'insert'),      'authenticated cannot insert a competency result');
select ok(not has_any_column_privilege('authenticated', 'app.competency_results'::regclass, 'update'),      'authenticated cannot rewrite a competency result');
select ok(not has_table_privilege('authenticated', 'app.competency_results'::regclass, 'delete'),           'authenticated cannot delete a competency result');

select ok(not has_any_column_privilege('authenticated', 'app.learning_path_items'::regclass, 'insert'),     'authenticated cannot insert a learning path item');
select ok(not has_any_column_privilege('authenticated', 'app.learning_path_items'::regclass, 'update'),     'authenticated cannot reorder a learning path');
select ok(not has_table_privilege('authenticated', 'app.learning_path_items'::regclass, 'delete'),          'authenticated cannot delete a learning path item');

select ok(not has_any_column_privilege('authenticated', 'app.student_module_progress'::regclass, 'insert'), 'authenticated cannot insert module progress');
select ok(not has_any_column_privilege('authenticated', 'app.student_module_progress'::regclass, 'update'), 'authenticated cannot rewrite module progress');
select ok(not has_table_privilege('authenticated', 'app.student_module_progress'::regclass, 'delete'),      'authenticated cannot delete module progress');

select ok(not has_any_column_privilege('authenticated', 'app.activity_attempts'::regclass, 'insert'),       'authenticated cannot insert an activity attempt');
select ok(not has_any_column_privilege('authenticated', 'app.activity_attempts'::regclass, 'update'),       'authenticated cannot rewrite an activity attempt');
select ok(not has_table_privilege('authenticated', 'app.activity_attempts'::regclass, 'delete'),            'authenticated cannot delete an activity attempt');

select ok(not has_any_column_privilege('authenticated', 'app.competency_progress'::regclass, 'insert'),     'authenticated cannot insert competency progress');
select ok(not has_any_column_privilege('authenticated', 'app.competency_progress'::regclass, 'update'),     'authenticated cannot rewrite competency progress or its mastery band');
select ok(not has_table_privilege('authenticated', 'app.competency_progress'::regclass, 'delete'),          'authenticated cannot delete competency progress');

-- The deterministic backend identity keeps full access.
select ok(has_table_privilege('service_role', 'app.competency_results'::regclass, 'insert'),
          'service_role records deterministic competency results');
select ok(has_table_privilege('service_role', 'app.competency_progress'::regclass, 'update'),
          'service_role maintains deterministic competency progress');

-- ---------------------------------------------------------------------------
-- Indexes for history, progress, paths and dashboards
-- ---------------------------------------------------------------------------
select ok(to_regclass('app.assessment_attempts_student_history_idx') is not null, 'Assessment history by learner is indexed');
select ok(to_regclass('app.assessment_attempts_assessment_idx') is not null,      'Assessment history by assessment is indexed');
select ok(to_regclass('app.assessment_attempts_one_in_progress_key') is not null, 'At most one attempt per learner and assessment may be in progress');
select ok(to_regclass('app.assessment_responses_question_idx') is not null,       'The response question foreign key is indexed');
select ok(to_regclass('app.competency_results_competency_idx') is not null,       'Competency results are indexed by competency');
select ok(to_regclass('app.learning_path_items_student_order_idx') is not null,   'Learning paths are indexed in priority order');
select ok(to_regclass('app.student_module_progress_student_complete_idx') is not null, 'Module completion is indexed for dashboards');
select ok(to_regclass('app.activity_attempts_student_history_idx') is not null,   'Activity history by learner is indexed');
select ok(to_regclass('app.competency_progress_student_band_idx') is not null,    'Competency progress is indexed by learner and band');
select ok(to_regclass('app.competency_progress_unsuccessful_idx') is not null,    'Unsuccessful attempts are indexed for the intervention trigger');

select * from finish();

rollback;
