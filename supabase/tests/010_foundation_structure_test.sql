-- MathSmart Phase 1 — structural verification of the database foundation.
--
-- Asserts that the migration chain produced the canonical entities, key types,
-- indexes, triggers and privilege boundary. Row behaviour is covered by
-- 030_foundation_rls_test.sql.
--
-- `supabase test db` wraps each file in its own transaction and rolls it back,
-- so nothing here persists.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Schema and tables
-- ---------------------------------------------------------------------------
select has_schema('app'::name, 'The private application schema app exists');

select has_table('app'::name, 'user_profiles'::name,          'app.user_profiles exists');
select has_table('app'::name, 'grade_levels'::name,           'app.grade_levels exists');
select has_table('app'::name, 'teacher_admin_profiles'::name, 'app.teacher_admin_profiles exists');
select has_table('app'::name, 'sections'::name,               'app.sections exists');
select has_table('app'::name, 'student_profiles'::name,       'app.student_profiles exists');

-- ---------------------------------------------------------------------------
-- Canonical columns
-- ---------------------------------------------------------------------------
select has_column('app'::name, 'user_profiles'::name, 'user_id'::name,    'app.user_profiles.user_id exists');
select has_column('app'::name, 'user_profiles'::name, 'full_name'::name,  'app.user_profiles.full_name exists');
select has_column('app'::name, 'user_profiles'::name, 'email'::name,      'app.user_profiles.email exists');
select has_column('app'::name, 'user_profiles'::name, 'role'::name,       'app.user_profiles.role exists');
select has_column('app'::name, 'user_profiles'::name, 'avatar_url'::name, 'app.user_profiles.avatar_url exists');
select has_column('app'::name, 'user_profiles'::name, 'created_at'::name, 'app.user_profiles.created_at exists');
select has_column('app'::name, 'user_profiles'::name, 'updated_at'::name, 'app.user_profiles.updated_at exists');

select has_column('app'::name, 'student_profiles'::name, 'student_id'::name,        'app.student_profiles.student_id exists');
select has_column('app'::name, 'student_profiles'::name, 'user_id'::name,           'app.student_profiles.user_id exists');
select has_column('app'::name, 'student_profiles'::name, 'learner_id'::name,        'app.student_profiles.learner_id exists');
select has_column('app'::name, 'student_profiles'::name, 'grade_id'::name,          'app.student_profiles.grade_id exists');
select has_column('app'::name, 'student_profiles'::name, 'section_id'::name,        'app.student_profiles.section_id exists');
select has_column('app'::name, 'student_profiles'::name, 'monitoring_status'::name, 'app.student_profiles.monitoring_status exists');
select has_column('app'::name, 'student_profiles'::name, 'created_at'::name,        'app.student_profiles.created_at exists');

select has_column('app'::name, 'teacher_admin_profiles'::name, 'teacher_admin_id'::name, 'app.teacher_admin_profiles.teacher_admin_id exists');
select has_column('app'::name, 'teacher_admin_profiles'::name, 'user_id'::name,          'app.teacher_admin_profiles.user_id exists');
select has_column('app'::name, 'teacher_admin_profiles'::name, 'employee_id'::name,      'app.teacher_admin_profiles.employee_id exists');
select has_column('app'::name, 'teacher_admin_profiles'::name, 'school_name'::name,      'app.teacher_admin_profiles.school_name exists');
select has_column('app'::name, 'teacher_admin_profiles'::name, 'division_name'::name,    'app.teacher_admin_profiles.division_name exists');
select has_column('app'::name, 'teacher_admin_profiles'::name, 'created_at'::name,       'app.teacher_admin_profiles.created_at exists');
select has_column('app'::name, 'teacher_admin_profiles'::name, 'updated_at'::name,       'app.teacher_admin_profiles.updated_at exists');

select has_column('app'::name, 'grade_levels'::name, 'grade_id'::name,  'app.grade_levels.grade_id exists');
select has_column('app'::name, 'grade_levels'::name, 'name'::name,      'app.grade_levels.name exists');
select has_column('app'::name, 'grade_levels'::name, 'level'::name,     'app.grade_levels.level exists');
select has_column('app'::name, 'grade_levels'::name, 'is_active'::name, 'app.grade_levels.is_active exists');

select has_column('app'::name, 'sections'::name, 'section_id'::name, 'app.sections.section_id exists');
select has_column('app'::name, 'sections'::name, 'grade_id'::name,   'app.sections.grade_id exists');
select has_column('app'::name, 'sections'::name, 'adviser_id'::name, 'app.sections.adviser_id exists');
select has_column('app'::name, 'sections'::name, 'name'::name,       'app.sections.name exists');
select has_column('app'::name, 'sections'::name, 'is_active'::name,  'app.sections.is_active exists');

-- No application table may hold credentials.
select hasnt_column('app'::name, 'user_profiles'::name, 'password'::name,           'app.user_profiles stores no password');
select hasnt_column('app'::name, 'user_profiles'::name, 'encrypted_password'::name, 'app.user_profiles stores no password hash');
select hasnt_column('app'::name, 'user_profiles'::name, 'password_hash'::name,      'app.user_profiles stores no password hash column');

-- ---------------------------------------------------------------------------
-- Primary keys and key types
-- ---------------------------------------------------------------------------
select col_is_pk('app'::name, 'user_profiles'::name,          'user_id'::name,          'app.user_profiles is keyed by user_id');
select col_is_pk('app'::name, 'grade_levels'::name,           'grade_id'::name,         'app.grade_levels is keyed by grade_id');
select col_is_pk('app'::name, 'teacher_admin_profiles'::name, 'teacher_admin_id'::name, 'app.teacher_admin_profiles is keyed by teacher_admin_id');
select col_is_pk('app'::name, 'sections'::name,               'section_id'::name,       'app.sections is keyed by section_id');
select col_is_pk('app'::name, 'student_profiles'::name,       'student_id'::name,       'app.student_profiles is keyed by student_id');

select col_type_is('app'::name, 'user_profiles'::name,          'user_id'::name,          'uuid'::text, 'app.user_profiles.user_id is uuid');
select col_type_is('app'::name, 'grade_levels'::name,           'grade_id'::name,         'uuid'::text, 'app.grade_levels.grade_id is uuid');
select col_type_is('app'::name, 'teacher_admin_profiles'::name, 'teacher_admin_id'::name, 'uuid'::text, 'app.teacher_admin_profiles.teacher_admin_id is uuid');
select col_type_is('app'::name, 'sections'::name,               'section_id'::name,       'uuid'::text, 'app.sections.section_id is uuid');
select col_type_is('app'::name, 'student_profiles'::name,       'student_id'::name,       'uuid'::text, 'app.student_profiles.student_id is uuid');

select col_type_is('app'::name, 'user_profiles'::name,    'created_at'::name, 'timestamp with time zone'::text, 'app.user_profiles.created_at is timestamptz');
select col_type_is('app'::name, 'user_profiles'::name,    'updated_at'::name, 'timestamp with time zone'::text, 'app.user_profiles.updated_at is timestamptz');
select col_type_is('app'::name, 'student_profiles'::name, 'created_at'::name, 'timestamp with time zone'::text, 'app.student_profiles.created_at is timestamptz');
select col_type_is('app'::name, 'sections'::name,         'updated_at'::name, 'timestamp with time zone'::text, 'app.sections.updated_at is timestamptz');
select col_type_is('app'::name, 'grade_levels'::name,     'level'::name,      'integer'::text,                  'app.grade_levels.level is integer');
select col_type_is('app'::name, 'grade_levels'::name,     'is_active'::name,  'boolean'::text,                  'app.grade_levels.is_active is boolean');

-- ---------------------------------------------------------------------------
-- Role vocabulary
-- ---------------------------------------------------------------------------
-- Asserted as exact equality on purpose. These values mirror the frozen
-- canonical enum table, so an added label is a documentation conflict that
-- should fail loudly rather than pass a containment check.
select is(
  (select string_agg(role_value::text, ',' order by role_value::text) from unnest(enum_range(null::app.user_role)) as role_value),
  'student,teacher_admin',
  'app.user_role contains exactly the two MathSmart production roles'
);

select is(
  (select string_agg(status_value::text, ',' order by status_value::text) from unnest(enum_range(null::app.monitoring_status)) as status_value),
  'active,improving,inactive,mastered,needs_intervention',
  'app.monitoring_status matches the canonical learner monitoring vocabulary'
);

-- ---------------------------------------------------------------------------
-- Row Level Security is enabled on every application table
-- ---------------------------------------------------------------------------
select ok(
  (select bool_and(pg_class.relrowsecurity)
   from pg_class
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'app'
     and pg_class.relkind = 'r'),
  'Row Level Security is enabled on every table in the app schema'
);

select ok(
  (select count(*)
   from pg_policy
   join pg_class on pg_class.oid = pg_policy.polrelid
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'app') >= 12,
  'The app schema carries policies for every table that has RLS enabled'
);

-- ---------------------------------------------------------------------------
-- Anonymous callers reach nothing
-- ---------------------------------------------------------------------------
select ok(not has_schema_privilege('anon', 'app', 'usage'), 'anon has no USAGE on the app schema');

select ok(not has_any_column_privilege('anon', 'app.user_profiles'::regclass, 'select'),          'anon cannot select app.user_profiles');
select ok(not has_any_column_privilege('anon', 'app.grade_levels'::regclass, 'select'),           'anon cannot select app.grade_levels');
select ok(not has_any_column_privilege('anon', 'app.teacher_admin_profiles'::regclass, 'select'), 'anon cannot select app.teacher_admin_profiles');
select ok(not has_any_column_privilege('anon', 'app.sections'::regclass, 'select'),               'anon cannot select app.sections');
select ok(not has_any_column_privilege('anon', 'app.student_profiles'::regclass, 'select'),       'anon cannot select app.student_profiles');

select ok(not has_any_column_privilege('anon', 'app.student_profiles'::regclass, 'insert'), 'anon cannot insert into app.student_profiles');
select ok(not has_table_privilege('anon', 'app.student_profiles'::regclass, 'delete'),      'anon cannot delete from app.student_profiles');

-- ---------------------------------------------------------------------------
-- Column-level protection for authenticated callers
-- ---------------------------------------------------------------------------
select ok(has_column_privilege('authenticated', 'app.user_profiles'::regclass, 'full_name'::text, 'update'),
          'authenticated may update its own display name');
select ok(not has_column_privilege('authenticated', 'app.user_profiles'::regclass, 'role'::text, 'update'),
          'authenticated can never update app.user_profiles.role');
select ok(not has_column_privilege('authenticated', 'app.user_profiles'::regclass, 'email'::text, 'update'),
          'authenticated can never update app.user_profiles.email');
select ok(not has_any_column_privilege('authenticated', 'app.user_profiles'::regclass, 'insert'),
          'authenticated cannot insert application profiles; provisioning is a backend operation');
select ok(not has_any_column_privilege('authenticated', 'app.teacher_admin_profiles'::regclass, 'insert'),
          'authenticated cannot insert Teacher/Administrator profiles');
select ok(not has_column_privilege('authenticated', 'app.student_profiles'::regclass, 'role'::text, 'update'),
          'authenticated can never update app.student_profiles.role');

select ok(not has_table_privilege('authenticated', 'app.user_profiles'::regclass, 'delete'),          'authenticated cannot delete app.user_profiles');
select ok(not has_table_privilege('authenticated', 'app.student_profiles'::regclass, 'delete'),       'authenticated cannot delete app.student_profiles');
select ok(not has_table_privilege('authenticated', 'app.teacher_admin_profiles'::regclass, 'delete'), 'authenticated cannot delete app.teacher_admin_profiles');
select ok(not has_table_privilege('authenticated', 'app.grade_levels'::regclass, 'delete'),           'authenticated cannot delete app.grade_levels');
select ok(not has_table_privilege('authenticated', 'app.sections'::regclass, 'delete'),               'authenticated cannot delete app.sections');

-- ---------------------------------------------------------------------------
-- The FastAPI backend identity keeps full access
-- ---------------------------------------------------------------------------
select ok(has_schema_privilege('service_role', 'app', 'usage'), 'service_role has USAGE on the app schema');
select ok(has_table_privilege('service_role', 'app.student_profiles'::regclass, 'select'), 'service_role can read app.student_profiles');
select ok(has_table_privilege('service_role', 'app.student_profiles'::regclass, 'delete'), 'service_role can delete app.student_profiles');

-- ---------------------------------------------------------------------------
-- Helper routines are hardened
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER remains the rule. Every exception is listed here, and each
-- one exists because the caller's own rights genuinely cannot do the work:
--
--   is_active_account        a policy on the table it reads consults it, so
--                            invoker rights would recurse
--   module_section_ids,      a learner's own record is SELECT-only for
--   save_module_progress,    `authenticated`, so their own progress is written
--   complete_module          through a function instead of a grant
--   start_assessment_attempt,
--   save_assessment_answers  the same, for attempts
--   submit_assessment_attempt  grading reads app.questions.answer_key, which
--                            `authenticated` deliberately cannot select
--   authorize_reassessment   an authorization is a decision, and the table that
--                            records it is SELECT-only for the caller
--
-- A new name appearing here is a review item, not a formatting change.
select is(
  (select string_agg(pg_proc.proname, ',' order by pg_proc.proname)
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'
     and pg_proc.prosecdef),
  'authorize_reassessment,complete_module,is_active_account,module_section_ids,'
  || 'save_assessment_answers,save_module_progress,start_assessment_attempt,'
  || 'submit_assessment_attempt',
  'Only the reviewed functions are SECURITY DEFINER'
);

select ok(
  (select bool_and(pg_proc.proconfig::text like '%search_path%')
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app'),
  'Every function in the app schema pins its search_path'
);

select ok(not has_function_privilege('anon', 'app.is_teacher_admin()', 'execute'),
          'anon cannot execute app.is_teacher_admin()');
select ok(has_function_privilege('authenticated', 'app.is_teacher_admin()', 'execute'),
          'authenticated can execute app.is_teacher_admin()');

-- ---------------------------------------------------------------------------
-- Indexes for foreign keys and common lookups
-- ---------------------------------------------------------------------------
select ok(to_regclass('app.sections_grade_id_idx') is not null,                 'app.sections.grade_id is indexed');
select ok(to_regclass('app.sections_adviser_id_idx') is not null,               'app.sections.adviser_id is indexed');
select ok(to_regclass('app.sections_grade_name_key') is not null,               'Section names are unique within a grade');
select ok(to_regclass('app.student_profiles_grade_id_idx') is not null,         'app.student_profiles.grade_id is indexed');
select ok(to_regclass('app.student_profiles_section_grade_idx') is not null,    'app.student_profiles section enrolment is indexed');
select ok(to_regclass('app.student_profiles_monitoring_status_idx') is not null,'app.student_profiles.monitoring_status is indexed');
select ok(to_regclass('app.user_profiles_role_idx') is not null,                'app.user_profiles.role is indexed');
select ok(to_regclass('app.grade_levels_active_level_idx') is not null,         'Active grade levels are indexed');

-- ---------------------------------------------------------------------------
-- updated_at is maintained by the server
-- ---------------------------------------------------------------------------
-- Scoped to the Phase 1 tables by name. A schema-wide count would have to be
-- revised by every later phase that adds a table with updated_at.
select is(
  (select count(*)
   from pg_trigger
   join pg_class on pg_class.oid = pg_trigger.tgrelid
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'app'
     and pg_class.relname in ('user_profiles', 'grade_levels', 'teacher_admin_profiles',
                              'sections', 'student_profiles')
     and not pg_trigger.tgisinternal
     and pg_trigger.tgname like '%_set_updated_at'),
  5::bigint,
  'Every foundation table maintains updated_at through a trigger'
);

select * from finish();

rollback;
