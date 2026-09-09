-- MathSmart Phase 2 — learning content, part 2 of 3.
--
-- The curriculum entities:
--   app.competencies, app.learning_modules, app.questions, app.assessments,
--   app.assessment_questions, app.activities, app.activity_questions
--
-- The schema stays extensible across grades; the MVP authors Grade 6 only. No
-- curriculum content is created by this migration: inventing DepEd competency
-- codes or learning material is an authoring decision, not a schema one.
--
-- Membership tables carry the ordering. A composite primary key stops the same
-- question being added to the same assessment or activity twice, and a separate
-- unique constraint stops two questions claiming the same position.

-- ---------------------------------------------------------------------------
-- app.competencies
-- ---------------------------------------------------------------------------
create table app.competencies (
  competency_id uuid primary key default gen_random_uuid(),
  code text not null,
  grade_id uuid not null
    references app.grade_levels (grade_id)
    on update cascade
    on delete restrict,
  domain text not null,
  name text not null,
  description text,
  status app.publication_status not null default 'draft',
  prerequisite_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Codes are school-facing identifiers, stored normalised so uniqueness is
  -- genuinely case-insensitive.
  constraint competencies_code_normalised
    check (code = upper(btrim(code))),
  constraint competencies_code_format
    check (code ~ '^[A-Z0-9][A-Z0-9._-]{2,63}$'),
  constraint competencies_code_key unique (code),

  constraint competencies_domain_not_blank
    check (btrim(domain) <> ''),
  constraint competencies_domain_length
    check (char_length(domain) between 2 and 120),
  constraint competencies_name_not_blank
    check (btrim(name) <> ''),
  constraint competencies_name_length
    check (char_length(name) between 2 and 300),
  constraint competencies_description_length
    check (description is null or char_length(description) <= 4000),

  constraint competencies_prerequisite_ids_is_array
    check (jsonb_typeof(prerequisite_ids) = 'array'),
  constraint competencies_prerequisite_ids_are_strings
    check (not jsonb_path_exists(prerequisite_ids, '$[*] ? (@.type() != "string")')),
  -- A competency can never be its own prerequisite.
  constraint competencies_prerequisite_ids_exclude_self
    check (not jsonb_exists(prerequisite_ids, competency_id::text)),

  constraint competencies_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.competencies is
  'Curriculum competency scoped to a grade level, carrying a unique school-facing code, a publication state, and optional prerequisites. prerequisite_ids is an array of competency_id strings.';

create index competencies_grade_id_idx on app.competencies (grade_id);
create index competencies_status_idx on app.competencies (status);
create index competencies_grade_status_idx on app.competencies (grade_id, status);
create index competencies_domain_idx on app.competencies (domain);

create trigger competencies_set_updated_at
  before update on app.competencies
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.learning_modules
-- ---------------------------------------------------------------------------
create table app.learning_modules (
  module_id uuid primary key default gen_random_uuid(),
  competency_id uuid not null
    references app.competencies (competency_id)
    on update cascade
    on delete restrict,
  title text not null,
  estimated_minutes integer not null,
  learning_objective text not null,
  short_explanation text not null,
  rules jsonb not null default '[]'::jsonb,
  worked_examples jsonb not null default '[]'::jsonb,
  status app.publication_status not null default 'draft',
  version integer not null default 1,
  order_index integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint learning_modules_title_not_blank
    check (btrim(title) <> ''),
  constraint learning_modules_title_length
    check (char_length(title) between 2 and 300),
  constraint learning_modules_estimated_minutes_positive
    check (estimated_minutes between 1 and 600),
  constraint learning_modules_learning_objective_not_blank
    check (btrim(learning_objective) <> ''),
  constraint learning_modules_short_explanation_not_blank
    check (btrim(short_explanation) <> ''),
  constraint learning_modules_rules_is_array
    check (jsonb_typeof(rules) = 'array'),
  constraint learning_modules_worked_examples_is_array
    check (jsonb_typeof(worked_examples) = 'array'),
  constraint learning_modules_version_positive
    check (version >= 1),
  constraint learning_modules_order_index_not_negative
    check (order_index >= 0),
  constraint learning_modules_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.learning_modules is
  'ARAL learning module belonging to one competency. order_index sequences the modules a learner works through.';

-- Live modules hold a distinct position inside their competency; archived ones
-- are allowed to collide because they are out of the learner's sequence.
create unique index learning_modules_competency_order_key
  on app.learning_modules (competency_id, order_index)
  where status <> 'archived';

create unique index learning_modules_competency_title_version_key
  on app.learning_modules (competency_id, lower(title), version);

create index learning_modules_competency_id_idx on app.learning_modules (competency_id);
create index learning_modules_status_idx on app.learning_modules (status);
create index learning_modules_competency_status_order_idx
  on app.learning_modules (competency_id, status, order_index);

create trigger learning_modules_set_updated_at
  before update on app.learning_modules
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.questions
-- ---------------------------------------------------------------------------
-- answer_key, explanation and hint are server-only. RLS cannot hide a column,
-- so the privileges in part 3 of this phase are what actually keep them out of
-- reach; see that migration for the column grants.
create table app.questions (
  question_id uuid primary key default gen_random_uuid(),
  competency_id uuid not null
    references app.competencies (competency_id)
    on update cascade
    on delete restrict,
  question_type app.question_type not null,
  difficulty app.question_difficulty not null default 'medium',
  prompt text not null,
  choices jsonb not null default '[]'::jsonb,
  answer_key jsonb not null,
  explanation text,
  hint text,
  status app.publication_status not null default 'draft',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint questions_prompt_not_blank
    check (btrim(prompt) <> ''),
  constraint questions_prompt_length
    check (char_length(prompt) between 2 and 4000),

  constraint questions_choices_is_array
    check (jsonb_typeof(choices) = 'array'),
  -- A multiple-choice item is meaningless without alternatives.
  constraint questions_multiple_choice_has_choices
    check (
      question_type <> 'multiple_choice'
      or jsonb_array_length(choices) >= 2
    ),

  -- An answer key must actually carry a value; deterministic grading depends on
  -- it, and JSON null would silently pass a NOT NULL column.
  constraint questions_answer_key_present
    check (answer_key <> 'null'::jsonb),

  constraint questions_explanation_length
    check (explanation is null or char_length(explanation) <= 4000),
  constraint questions_hint_length
    check (hint is null or char_length(hint) <= 1000),

  -- true_false, matching and ordering are reserved in the data contract but are
  -- not deliverable yet, so nothing using them may reach learners.
  constraint questions_published_type_is_supported
    check (
      status <> 'published'
      or question_type in ('multiple_choice', 'number_input', 'fill_blank')
    ),

  constraint questions_version_positive
    check (version >= 1),
  constraint questions_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.questions is
  'Reusable question-bank item belonging to one competency. answer_key, explanation and hint are server-only and are withheld from the authenticated role by column privileges.';
comment on column app.questions.answer_key is
  'Server-only. Never included in a pre-submission response.';

create index questions_competency_id_idx on app.questions (competency_id);
create index questions_status_idx on app.questions (status);
create index questions_competency_status_idx on app.questions (competency_id, status);
create index questions_type_difficulty_idx on app.questions (question_type, difficulty);

create trigger questions_set_updated_at
  before update on app.questions
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.assessments
-- ---------------------------------------------------------------------------
create table app.assessments (
  assessment_id uuid primary key default gen_random_uuid(),
  grade_id uuid not null
    references app.grade_levels (grade_id)
    on update cascade
    on delete restrict,
  title text not null,
  assessment_type app.assessment_type not null,
  status app.publication_status not null default 'draft',
  duration_minutes integer not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assessments_title_not_blank
    check (btrim(title) <> ''),
  constraint assessments_title_length
    check (char_length(title) between 2 and 300),
  constraint assessments_duration_minutes_positive
    check (duration_minutes between 1 and 480),
  constraint assessments_version_positive
    check (version >= 1),
  constraint assessments_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.assessments is
  'Assessment definition scoped to a grade level. Ordered question membership lives in app.assessment_questions.';

create unique index assessments_grade_title_version_key
  on app.assessments (grade_id, lower(title), version);

create index assessments_grade_id_idx on app.assessments (grade_id);
create index assessments_status_idx on app.assessments (status);
create index assessments_grade_status_type_idx on app.assessments (grade_id, status, assessment_type);

create trigger assessments_set_updated_at
  before update on app.assessments
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.assessment_questions
-- ---------------------------------------------------------------------------
create table app.assessment_questions (
  assessment_id uuid not null
    references app.assessments (assessment_id)
    on update cascade
    on delete cascade,
  question_id uuid not null
    references app.questions (question_id)
    on update cascade
    on delete restrict,
  position integer not null,
  created_at timestamptz not null default now(),

  constraint assessment_questions_pkey primary key (assessment_id, question_id),
  constraint assessment_questions_position_positive
    check (position >= 1),
  constraint assessment_questions_position_key unique (assessment_id, position)
);

comment on table app.assessment_questions is
  'Ordered assessment membership. The primary key forbids a repeated question and the unique constraint forbids a repeated position.';

create index assessment_questions_question_id_idx on app.assessment_questions (question_id);
create index assessment_questions_order_idx on app.assessment_questions (assessment_id, position);

-- ---------------------------------------------------------------------------
-- app.activities
-- ---------------------------------------------------------------------------
create table app.activities (
  activity_id uuid primary key default gen_random_uuid(),
  module_id uuid not null
    references app.learning_modules (module_id)
    on update cascade
    on delete restrict,
  title text not null,
  description text,
  estimated_minutes integer not null,
  points integer not null default 0,
  mastery_threshold integer not null default 75,
  status app.publication_status not null default 'draft',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint activities_title_not_blank
    check (btrim(title) <> ''),
  constraint activities_title_length
    check (char_length(title) between 2 and 300),
  constraint activities_description_length
    check (description is null or char_length(description) <= 4000),
  constraint activities_estimated_minutes_positive
    check (estimated_minutes between 1 and 600),
  constraint activities_points_not_negative
    check (points >= 0),
  -- A pass threshold is a percentage of the activity score.
  constraint activities_mastery_threshold_range
    check (mastery_threshold between 1 and 100),
  constraint activities_version_positive
    check (version >= 1),
  constraint activities_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.activities is
  'Practice activity belonging to one learning module. A module may have more than one.';

create unique index activities_module_title_version_key
  on app.activities (module_id, lower(title), version);

create index activities_module_id_idx on app.activities (module_id);
create index activities_status_idx on app.activities (status);
create index activities_module_status_idx on app.activities (module_id, status);

create trigger activities_set_updated_at
  before update on app.activities
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.activity_questions
-- ---------------------------------------------------------------------------
create table app.activity_questions (
  activity_id uuid not null
    references app.activities (activity_id)
    on update cascade
    on delete cascade,
  question_id uuid not null
    references app.questions (question_id)
    on update cascade
    on delete restrict,
  position integer not null,
  created_at timestamptz not null default now(),

  constraint activity_questions_pkey primary key (activity_id, question_id),
  constraint activity_questions_position_positive
    check (position >= 1),
  constraint activity_questions_position_key unique (activity_id, position)
);

comment on table app.activity_questions is
  'Ordered activity membership. The primary key forbids a repeated question and the unique constraint forbids a repeated position.';

create index activity_questions_question_id_idx on app.activity_questions (question_id);
create index activity_questions_order_idx on app.activity_questions (activity_id, position);
