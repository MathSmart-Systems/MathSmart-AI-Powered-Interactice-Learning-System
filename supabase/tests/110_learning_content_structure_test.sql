-- MathSmart Phase 2 — structural verification of the learning-content schema.
--
-- Covers the entities, the controlled vocabularies, RLS enablement, the
-- privilege boundary, and above all the column privileges that keep answer keys
-- server-only. Row behaviour is covered by 130_learning_content_rls_test.sql.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Entities
-- ---------------------------------------------------------------------------
select has_table('app'::name, 'competencies'::name,         'app.competencies exists');
select has_table('app'::name, 'learning_modules'::name,     'app.learning_modules exists');
select has_table('app'::name, 'questions'::name,            'app.questions exists');
select has_table('app'::name, 'assessments'::name,          'app.assessments exists');
select has_table('app'::name, 'assessment_questions'::name, 'app.assessment_questions exists');
select has_table('app'::name, 'activities'::name,           'app.activities exists');
select has_table('app'::name, 'activity_questions'::name,   'app.activity_questions exists');

-- ---------------------------------------------------------------------------
-- Canonical columns
-- ---------------------------------------------------------------------------
select has_column('app'::name, 'competencies'::name, 'competency_id'::name,    'app.competencies.competency_id exists');
select has_column('app'::name, 'competencies'::name, 'code'::name,             'app.competencies.code exists');
select has_column('app'::name, 'competencies'::name, 'grade_id'::name,         'app.competencies.grade_id exists');
select has_column('app'::name, 'competencies'::name, 'domain'::name,           'app.competencies.domain exists');
select has_column('app'::name, 'competencies'::name, 'name'::name,             'app.competencies.name exists');
select has_column('app'::name, 'competencies'::name, 'description'::name,      'app.competencies.description exists');
select has_column('app'::name, 'competencies'::name, 'status'::name,           'app.competencies.status exists');
select has_column('app'::name, 'competencies'::name, 'prerequisite_ids'::name, 'app.competencies.prerequisite_ids exists');

select has_column('app'::name, 'learning_modules'::name, 'module_id'::name,         'app.learning_modules.module_id exists');
select has_column('app'::name, 'learning_modules'::name, 'competency_id'::name,     'app.learning_modules.competency_id exists');
select has_column('app'::name, 'learning_modules'::name, 'title'::name,             'app.learning_modules.title exists');
select has_column('app'::name, 'learning_modules'::name, 'estimated_minutes'::name, 'app.learning_modules.estimated_minutes exists');
select has_column('app'::name, 'learning_modules'::name, 'learning_objective'::name,'app.learning_modules.learning_objective exists');
select has_column('app'::name, 'learning_modules'::name, 'short_explanation'::name, 'app.learning_modules.short_explanation exists');
select has_column('app'::name, 'learning_modules'::name, 'rules'::name,             'app.learning_modules.rules exists');
select has_column('app'::name, 'learning_modules'::name, 'worked_examples'::name,   'app.learning_modules.worked_examples exists');
select has_column('app'::name, 'learning_modules'::name, 'status'::name,            'app.learning_modules.status exists');
select has_column('app'::name, 'learning_modules'::name, 'version'::name,           'app.learning_modules.version exists');
select has_column('app'::name, 'learning_modules'::name, 'order_index'::name,       'app.learning_modules.order_index exists');

select has_column('app'::name, 'questions'::name, 'question_id'::name,   'app.questions.question_id exists');
select has_column('app'::name, 'questions'::name, 'competency_id'::name, 'app.questions.competency_id exists');
select has_column('app'::name, 'questions'::name, 'question_type'::name, 'app.questions.question_type exists');
select has_column('app'::name, 'questions'::name, 'difficulty'::name,    'app.questions.difficulty exists');
select has_column('app'::name, 'questions'::name, 'prompt'::name,        'app.questions.prompt exists');
select has_column('app'::name, 'questions'::name, 'choices'::name,       'app.questions.choices exists');
select has_column('app'::name, 'questions'::name, 'answer_key'::name,    'app.questions.answer_key exists');
select has_column('app'::name, 'questions'::name, 'explanation'::name,   'app.questions.explanation exists');
select has_column('app'::name, 'questions'::name, 'hint'::name,          'app.questions.hint exists');
select has_column('app'::name, 'questions'::name, 'status'::name,        'app.questions.status exists');
select has_column('app'::name, 'questions'::name, 'version'::name,       'app.questions.version exists');

select has_column('app'::name, 'assessments'::name, 'assessment_id'::name,    'app.assessments.assessment_id exists');
select has_column('app'::name, 'assessments'::name, 'grade_id'::name,         'app.assessments.grade_id exists');
select has_column('app'::name, 'assessments'::name, 'title'::name,            'app.assessments.title exists');
select has_column('app'::name, 'assessments'::name, 'assessment_type'::name,  'app.assessments.assessment_type exists');
select has_column('app'::name, 'assessments'::name, 'status'::name,           'app.assessments.status exists');
select has_column('app'::name, 'assessments'::name, 'duration_minutes'::name, 'app.assessments.duration_minutes exists');
select has_column('app'::name, 'assessments'::name, 'version'::name,          'app.assessments.version exists');

select has_column('app'::name, 'assessment_questions'::name, 'assessment_id'::name, 'app.assessment_questions.assessment_id exists');
select has_column('app'::name, 'assessment_questions'::name, 'question_id'::name,   'app.assessment_questions.question_id exists');
select has_column('app'::name, 'assessment_questions'::name, 'position'::name,      'app.assessment_questions.position exists');

select has_column('app'::name, 'activities'::name, 'activity_id'::name,       'app.activities.activity_id exists');
select has_column('app'::name, 'activities'::name, 'module_id'::name,         'app.activities.module_id exists');
select has_column('app'::name, 'activities'::name, 'title'::name,             'app.activities.title exists');
select has_column('app'::name, 'activities'::name, 'description'::name,       'app.activities.description exists');
select has_column('app'::name, 'activities'::name, 'estimated_minutes'::name, 'app.activities.estimated_minutes exists');
select has_column('app'::name, 'activities'::name, 'points'::name,            'app.activities.points exists');
select has_column('app'::name, 'activities'::name, 'mastery_threshold'::name, 'app.activities.mastery_threshold exists');
select has_column('app'::name, 'activities'::name, 'status'::name,            'app.activities.status exists');
select has_column('app'::name, 'activities'::name, 'version'::name,           'app.activities.version exists');

select has_column('app'::name, 'activity_questions'::name, 'activity_id'::name, 'app.activity_questions.activity_id exists');
select has_column('app'::name, 'activity_questions'::name, 'question_id'::name, 'app.activity_questions.question_id exists');
select has_column('app'::name, 'activity_questions'::name, 'position'::name,    'app.activity_questions.position exists');

-- ---------------------------------------------------------------------------
-- Keys and types
-- ---------------------------------------------------------------------------
select col_is_pk('app'::name, 'competencies'::name,     'competency_id'::name, 'app.competencies is keyed by competency_id');
select col_is_pk('app'::name, 'learning_modules'::name, 'module_id'::name,     'app.learning_modules is keyed by module_id');
select col_is_pk('app'::name, 'questions'::name,        'question_id'::name,   'app.questions is keyed by question_id');
select col_is_pk('app'::name, 'assessments'::name,      'assessment_id'::name, 'app.assessments is keyed by assessment_id');
select col_is_pk('app'::name, 'activities'::name,       'activity_id'::name,   'app.activities is keyed by activity_id');

select col_type_is('app'::name, 'questions'::name, 'answer_key'::name, 'jsonb'::text, 'app.questions.answer_key is jsonb');
select col_type_is('app'::name, 'competencies'::name, 'prerequisite_ids'::name, 'jsonb'::text, 'app.competencies.prerequisite_ids is jsonb');

-- Membership is keyed on the pair, which is what forbids a repeated question.
select is(
  (select string_agg(attname, ',' order by attname)
   from pg_index
   join pg_attribute on pg_attribute.attrelid = pg_index.indrelid
                    and pg_attribute.attnum = any (pg_index.indkey)
   where pg_index.indrelid = 'app.assessment_questions'::regclass
     and pg_index.indisprimary),
  'assessment_id,question_id',
  'app.assessment_questions is keyed on the assessment and question pair'
);

select is(
  (select string_agg(attname, ',' order by attname)
   from pg_index
   join pg_attribute on pg_attribute.attrelid = pg_index.indrelid
                    and pg_attribute.attnum = any (pg_index.indkey)
   where pg_index.indrelid = 'app.activity_questions'::regclass
     and pg_index.indisprimary),
  'activity_id,question_id',
  'app.activity_questions is keyed on the activity and question pair'
);

-- ---------------------------------------------------------------------------
-- Controlled vocabularies
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(status_value::text, ',' order by status_value::text)
   from unnest(enum_range(null::app.publication_status)) as status_value),
  'archived,draft,published',
  'app.publication_status carries the canonical draft, published and archived states'
);

select is(
  (select string_agg(type_value::text, ',' order by type_value::text)
   from unnest(enum_range(null::app.question_type)) as type_value),
  'fill_blank,matching,multiple_choice,number_input,ordering,true_false',
  'app.question_type carries the MVP types plus the reserved ones'
);

select is(
  (select string_agg(difficulty_value::text, ',' order by difficulty_value::text)
   from unnest(enum_range(null::app.question_difficulty)) as difficulty_value),
  'easy,hard,medium',
  'app.question_difficulty carries the canonical values'
);

select is(
  (select string_agg(assessment_value::text, ',' order by assessment_value::text)
   from unnest(enum_range(null::app.assessment_type)) as assessment_value),
  'diagnostic,reassessment,unit_quiz',
  'app.assessment_type carries the canonical values'
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
     and pg_class.relname in ('competencies', 'learning_modules', 'questions', 'assessments',
                              'assessment_questions', 'activities', 'activity_questions')) >= 23,
  'Every learning-content table carries policies for the commands it exposes'
);

-- ---------------------------------------------------------------------------
-- Answer-key confidentiality, enforced by column privileges
-- ---------------------------------------------------------------------------
select ok(not has_column_privilege('authenticated', 'app.questions'::regclass, 'answer_key'::text, 'select'),
          'authenticated can never read app.questions.answer_key');
select ok(not has_column_privilege('authenticated', 'app.questions'::regclass, 'explanation'::text, 'select'),
          'authenticated can never read app.questions.explanation');
select ok(not has_column_privilege('authenticated', 'app.questions'::regclass, 'hint'::text, 'select'),
          'authenticated can never read app.questions.hint');
select ok(not has_column_privilege('anon', 'app.questions'::regclass, 'answer_key'::text, 'select'),
          'anon can never read app.questions.answer_key');

-- The delivery columns a learner legitimately needs remain readable.
select ok(has_column_privilege('authenticated', 'app.questions'::regclass, 'prompt'::text, 'select'),
          'authenticated can read app.questions.prompt');
select ok(has_column_privilege('authenticated', 'app.questions'::regclass, 'choices'::text, 'select'),
          'authenticated can read app.questions.choices');

-- Authoring a key is a write, not a read; the policies restrict it to teacher_admin.
select ok(has_column_privilege('authenticated', 'app.questions'::regclass, 'answer_key'::text, 'insert'),
          'authenticated may author app.questions.answer_key, subject to policy');
select ok(has_column_privilege('service_role', 'app.questions'::regclass, 'answer_key'::text, 'select'),
          'service_role reads app.questions.answer_key for deterministic grading');

-- ---------------------------------------------------------------------------
-- Anonymous callers reach no curriculum content
-- ---------------------------------------------------------------------------
select ok(not has_any_column_privilege('anon', 'app.competencies'::regclass, 'select'),         'anon cannot select app.competencies');
select ok(not has_any_column_privilege('anon', 'app.learning_modules'::regclass, 'select'),     'anon cannot select app.learning_modules');
select ok(not has_any_column_privilege('anon', 'app.questions'::regclass, 'select'),            'anon cannot select app.questions');
select ok(not has_any_column_privilege('anon', 'app.assessments'::regclass, 'select'),          'anon cannot select app.assessments');
select ok(not has_any_column_privilege('anon', 'app.assessment_questions'::regclass, 'select'), 'anon cannot select app.assessment_questions');
select ok(not has_any_column_privilege('anon', 'app.activities'::regclass, 'select'),           'anon cannot select app.activities');
select ok(not has_any_column_privilege('anon', 'app.activity_questions'::regclass, 'select'),   'anon cannot select app.activity_questions');

-- ---------------------------------------------------------------------------
-- Authored content is archived, never deleted
-- ---------------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'app.competencies'::regclass, 'delete'),     'authenticated cannot delete competencies');
select ok(not has_table_privilege('authenticated', 'app.learning_modules'::regclass, 'delete'), 'authenticated cannot delete learning modules');
select ok(not has_table_privilege('authenticated', 'app.questions'::regclass, 'delete'),        'authenticated cannot delete questions');
select ok(not has_table_privilege('authenticated', 'app.assessments'::regclass, 'delete'),      'authenticated cannot delete assessments');
select ok(not has_table_privilege('authenticated', 'app.activities'::regclass, 'delete'),       'authenticated cannot delete activities');

-- Membership rows are replaced atomically, so they are the one exception.
select ok(has_table_privilege('authenticated', 'app.assessment_questions'::regclass, 'delete'),
          'authenticated may remove assessment membership, subject to policy');
select ok(has_table_privilege('authenticated', 'app.activity_questions'::regclass, 'delete'),
          'authenticated may remove activity membership, subject to policy');

-- ---------------------------------------------------------------------------
-- Helpers stay hardened
-- ---------------------------------------------------------------------------
select ok(
  (select not bool_or(pg_proc.prosecdef)
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'),
  'No function in the app schema uses SECURITY DEFINER'
);

select ok(
  (select bool_and(pg_proc.proconfig::text like '%search_path%')
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'),
  'Every function in the app schema pins its search_path'
);

select ok(not has_function_privilege('anon', 'app.can_read_content(app.publication_status)', 'execute'),
          'anon cannot execute app.can_read_content');

-- ---------------------------------------------------------------------------
-- Indexes for curriculum lookup, publication state and ordering
-- ---------------------------------------------------------------------------
select ok(to_regclass('app.competencies_grade_status_idx') is not null,             'Competency lookup by grade and publication state is indexed');
select ok(to_regclass('app.competencies_code_key') is not null,                     'Competency codes are unique');
select ok(to_regclass('app.learning_modules_competency_status_order_idx') is not null, 'Module ordering within a competency is indexed');
select ok(to_regclass('app.learning_modules_competency_order_key') is not null,     'Live module positions are unique within a competency');
select ok(to_regclass('app.questions_competency_status_idx') is not null,           'Question lookup by competency and publication state is indexed');
select ok(to_regclass('app.assessments_grade_status_type_idx') is not null,         'Assessment lookup by grade, state and type is indexed');
select ok(to_regclass('app.assessment_questions_order_idx') is not null,            'Assessment question ordering is indexed');
select ok(to_regclass('app.assessment_questions_question_id_idx') is not null,      'The assessment membership foreign key is indexed');
select ok(to_regclass('app.activities_module_status_idx') is not null,              'Activity lookup by module and publication state is indexed');
select ok(to_regclass('app.activity_questions_order_idx') is not null,              'Activity question ordering is indexed');
select ok(to_regclass('app.activity_questions_question_id_idx') is not null,        'The activity membership foreign key is indexed');

select * from finish();

rollback;
