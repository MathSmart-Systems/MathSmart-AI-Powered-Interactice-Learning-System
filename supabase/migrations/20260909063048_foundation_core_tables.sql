-- MathSmart Phase 1 — database foundation, part 2 of 4.
--
-- Canonical identity and school-organisation entities:
--   app.user_profiles, app.grade_levels, app.teacher_admin_profiles,
--   app.sections, app.student_profiles
--
-- Rules applied throughout
-- ------------------------
-- * Supabase Auth owns credentials. No application table stores a password, a
--   password hash, or any other secret.
-- * UUID primary keys, timestamptz timestamps, explicit ON DELETE behaviour.
-- * Exactly one MathSmart role profile per Auth user. The composite
--   (user_id, role) key on app.user_profiles lets each role profile table pin
--   itself to a single role, so one Auth user can never hold both a student and
--   a teacher_admin profile.

-- ---------------------------------------------------------------------------
-- app.user_profiles — application identity linked to a Supabase Auth user
-- ---------------------------------------------------------------------------
create table app.user_profiles (
  user_id uuid primary key references auth.users (id) on update cascade on delete cascade,
  full_name text not null,
  email text not null,
  role app.user_role not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_profiles_full_name_not_blank
    check (btrim(full_name) <> ''),
  constraint user_profiles_full_name_length
    check (char_length(full_name) between 2 and 120),

  -- Stored normalised so uniqueness is genuinely case-insensitive.
  constraint user_profiles_email_normalised
    check (email = lower(btrim(email))),
  constraint user_profiles_email_format
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint user_profiles_email_length
    check (char_length(email) between 6 and 254),
  constraint user_profiles_email_key unique (email),

  constraint user_profiles_avatar_url_https
    check (avatar_url is null or avatar_url ~ '^https://[^[:space:]]+$'),
  constraint user_profiles_avatar_url_length
    check (avatar_url is null or char_length(avatar_url) <= 2048),

  constraint user_profiles_updated_not_before_created
    check (updated_at >= created_at),

  -- Referenced by the role profile tables below. Enforces one role per user.
  constraint user_profiles_user_role_key unique (user_id, role)
);

comment on table app.user_profiles is
  'Application profile for a Supabase Auth user. Stores identity and the MathSmart role; never credentials or password hashes.';
comment on column app.user_profiles.role is
  'Authoritative MathSmart role. Must mirror the trusted app_metadata.role claim, which only the backend may set.';

create index user_profiles_role_idx on app.user_profiles (role);

create trigger user_profiles_set_updated_at
  before update on app.user_profiles
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.grade_levels — school organisation; Grade 6 is the MVP target
-- ---------------------------------------------------------------------------
create table app.grade_levels (
  grade_id uuid primary key default gen_random_uuid(),
  name text not null,
  level integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint grade_levels_name_not_blank
    check (btrim(name) <> ''),
  constraint grade_levels_name_trimmed
    check (name = btrim(name)),
  constraint grade_levels_name_length
    check (char_length(name) between 2 and 60),
  constraint grade_levels_name_key unique (name),

  constraint grade_levels_level_range
    check (level between 1 and 12),
  constraint grade_levels_level_key unique (level),

  constraint grade_levels_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.grade_levels is
  'Grade levels. The schema stays extensible; the MathSmart MVP seeds and targets Grade 6 only.';

create index grade_levels_active_level_idx
  on app.grade_levels (level)
  where is_active;

create trigger grade_levels_set_updated_at
  before update on app.grade_levels
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.teacher_admin_profiles — combined Teacher/Administrator record
-- ---------------------------------------------------------------------------
create table app.teacher_admin_profiles (
  teacher_admin_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  -- Pinned to a single role so the composite foreign key below can only match a
  -- user_profiles row whose role is teacher_admin.
  role app.user_role not null default 'teacher_admin',
  employee_id text not null,
  school_name text not null,
  division_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teacher_admin_profiles_role_check
    check (role = 'teacher_admin'),
  constraint teacher_admin_profiles_user_id_key unique (user_id),
  constraint teacher_admin_profiles_user_role_fkey
    foreign key (user_id, role)
    references app.user_profiles (user_id, role)
    on update cascade
    on delete cascade,

  constraint teacher_admin_profiles_employee_id_normalised
    check (employee_id = upper(btrim(employee_id))),
  constraint teacher_admin_profiles_employee_id_format
    check (employee_id ~ '^[A-Z0-9][A-Z0-9._-]{2,31}$'),
  constraint teacher_admin_profiles_employee_id_key unique (employee_id),

  constraint teacher_admin_profiles_school_name_not_blank
    check (btrim(school_name) <> ''),
  constraint teacher_admin_profiles_school_name_length
    check (char_length(school_name) between 2 and 160),
  constraint teacher_admin_profiles_division_name_not_blank
    check (btrim(division_name) <> ''),
  constraint teacher_admin_profiles_division_name_length
    check (char_length(division_name) between 2 and 160),

  constraint teacher_admin_profiles_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.teacher_admin_profiles is
  'Combined Teacher/Administrator record. One per Auth user, and only for an Auth user whose MathSmart role is teacher_admin.';

create trigger teacher_admin_profiles_set_updated_at
  before update on app.teacher_admin_profiles
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.sections — a class section inside a grade, optionally with an adviser
-- ---------------------------------------------------------------------------
create table app.sections (
  section_id uuid primary key default gen_random_uuid(),
  grade_id uuid not null
    references app.grade_levels (grade_id)
    on update cascade
    on delete restrict,
  adviser_id uuid
    references app.teacher_admin_profiles (teacher_admin_id)
    on update cascade
    on delete set null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sections_name_not_blank
    check (btrim(name) <> ''),
  constraint sections_name_trimmed
    check (name = btrim(name)),
  constraint sections_name_length
    check (char_length(name) between 1 and 60),

  constraint sections_updated_not_before_created
    check (updated_at >= created_at),

  -- Target of the composite foreign key on app.student_profiles, which keeps a
  -- learner's section inside the learner's own grade.
  constraint sections_section_grade_key unique (section_id, grade_id)
);

comment on table app.sections is
  'Class section within a grade level. adviser_id is the assigned Teacher/Administrator, if any.';

-- Section names are unique inside a grade, case-insensitively.
create unique index sections_grade_name_key
  on app.sections (grade_id, lower(name));

create index sections_grade_id_idx on app.sections (grade_id);
create index sections_adviser_id_idx on app.sections (adviser_id);
create index sections_active_grade_idx
  on app.sections (grade_id)
  where is_active;

create trigger sections_set_updated_at
  before update on app.sections
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.student_profiles — learner record
-- ---------------------------------------------------------------------------
create table app.student_profiles (
  student_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  -- Pinned exactly as in app.teacher_admin_profiles.
  role app.user_role not null default 'student',
  learner_id text not null,
  grade_id uuid not null
    references app.grade_levels (grade_id)
    on update cascade
    on delete restrict,
  section_id uuid,
  monitoring_status app.monitoring_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint student_profiles_role_check
    check (role = 'student'),
  constraint student_profiles_user_id_key unique (user_id),
  constraint student_profiles_user_role_fkey
    foreign key (user_id, role)
    references app.user_profiles (user_id, role)
    on update cascade
    on delete cascade,

  constraint student_profiles_learner_id_normalised
    check (learner_id = upper(btrim(learner_id))),
  constraint student_profiles_learner_id_format
    check (learner_id ~ '^[A-Z0-9][A-Z0-9-]{3,31}$'),
  constraint student_profiles_learner_id_key unique (learner_id),

  -- A learner's section must belong to the learner's own grade. Sections are
  -- archived via is_active rather than deleted, so RESTRICT is the correct
  -- delete behaviour here.
  constraint student_profiles_section_in_grade_fkey
    foreign key (section_id, grade_id)
    references app.sections (section_id, grade_id)
    on update cascade
    on delete restrict,

  constraint student_profiles_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.student_profiles is
  'Learner record. learner_id is the school-facing identifier; monitoring_status is maintained by deterministic server rules, never by the learner.';

create index student_profiles_grade_id_idx on app.student_profiles (grade_id);
create index student_profiles_section_grade_idx on app.student_profiles (section_id, grade_id);
create index student_profiles_monitoring_status_idx on app.student_profiles (monitoring_status);

create trigger student_profiles_set_updated_at
  before update on app.student_profiles
  for each row
  execute function app.set_updated_at();
