-- MathSmart Phase 3 — student learning records, part 2 of 3.
--
-- The learner-evidence entities:
--   app.assessment_attempts, app.assessment_responses, app.competency_results,
--   app.learning_path_items, app.student_module_progress,
--   app.activity_attempts, app.competency_progress
--
-- History is preserved. A learner may take a diagnostic, then a reassessment,
-- then retry an activity; nothing overwrites an earlier attempt. Uniqueness is
-- therefore applied only where a duplicate would be a defect: one response per
-- question per attempt, one result per competency per attempt, one progress row
-- per student and module, one per student and competency, and one attempt
-- number per student and activity.
--
-- Derived values are constrained, not merely typed. A percentage must equal
-- app.percentage_for of its own raw and max score, and a mastery band must equal
-- app.mastery_band_for of its own percentage. Deterministic rules therefore hold
-- at the storage layer, independently of whichever service wrote the row.

-- ---------------------------------------------------------------------------
-- app.assessment_attempts
-- ---------------------------------------------------------------------------
create table app.assessment_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null
    references app.assessments (assessment_id)
    on update cascade
    on delete restrict,
  student_id uuid not null
    references app.student_profiles (student_id)
    on update cascade
    on delete restrict,
  status app.attempt_status not null default 'in_progress',
  overall_score numeric(5,2),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assessment_attempts_overall_score_range
    check (overall_score is null or overall_score between 0 and 100),

  -- An attempt in progress has no submission time and no score. A scored one
  -- has both. Submitted sits between the two: finalised, not yet scored.
  constraint assessment_attempts_in_progress_is_unfinished
    check (
      status <> 'in_progress'
      or (submitted_at is null and overall_score is null)
    ),
  constraint assessment_attempts_finished_has_submitted_at
    check (
      status not in ('submitted', 'scored')
      or submitted_at is not null
    ),
  constraint assessment_attempts_scored_has_score
    check (
      status <> 'scored'
      or overall_score is not null
    ),
  constraint assessment_attempts_submitted_not_before_started
    check (submitted_at is null or submitted_at >= started_at),

  constraint assessment_attempts_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.assessment_attempts is
  'A learner''s resumable assessment session. Attempts accumulate; nothing overwrites an earlier one.';
comment on column app.assessment_attempts.overall_score is
  'Deterministic percentage produced at submission. Never set by an advisory model.';

-- A learner resumes an attempt rather than starting a second one, so at most
-- one attempt per assessment may be in progress. Finished attempts are free to
-- accumulate.
create unique index assessment_attempts_one_in_progress_key
  on app.assessment_attempts (student_id, assessment_id)
  where status = 'in_progress';

create index assessment_attempts_student_idx on app.assessment_attempts (student_id);
create index assessment_attempts_assessment_idx on app.assessment_attempts (assessment_id);
create index assessment_attempts_student_history_idx
  on app.assessment_attempts (student_id, submitted_at desc);
create index assessment_attempts_status_idx on app.assessment_attempts (status);

create trigger assessment_attempts_set_updated_at
  before update on app.assessment_attempts
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.assessment_responses
-- ---------------------------------------------------------------------------
create table app.assessment_responses (
  response_id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null
    references app.assessment_attempts (attempt_id)
    on update cascade
    on delete cascade,
  question_id uuid not null
    references app.questions (question_id)
    on update cascade
    on delete restrict,
  answer jsonb,
  is_correct boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One response per question per attempt. Autosave replaces the row rather
  -- than appending a second one.
  constraint assessment_responses_attempt_question_key unique (attempt_id, question_id),

  constraint assessment_responses_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.assessment_responses is
  'A learner''s answer to one question inside one attempt. is_correct stays NULL until deterministic grading runs.';
comment on column app.assessment_responses.is_correct is
  'Deterministic grading result. NULL before submission.';

create index assessment_responses_question_idx on app.assessment_responses (question_id);

create trigger assessment_responses_set_updated_at
  before update on app.assessment_responses
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.competency_results
-- ---------------------------------------------------------------------------
create table app.competency_results (
  result_id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null
    references app.assessment_attempts (attempt_id)
    on update cascade
    on delete cascade,
  competency_id uuid not null
    references app.competencies (competency_id)
    on update cascade
    on delete restrict,
  raw_score integer not null,
  max_score integer not null,
  percentage numeric(5,2) not null,
  mastery_band app.mastery_band not null,
  created_at timestamptz not null default now(),

  constraint competency_results_attempt_competency_key unique (attempt_id, competency_id),

  constraint competency_results_max_score_positive
    check (max_score >= 1),
  constraint competency_results_raw_score_range
    check (raw_score between 0 and max_score),

  -- The stored percentage and band must agree with the stored evidence.
  constraint competency_results_percentage_is_derived
    check (percentage = app.percentage_for(raw_score, max_score)),
  constraint competency_results_band_is_derived
    check (mastery_band = app.mastery_band_for(percentage))
);

comment on table app.competency_results is
  'Deterministic per-competency outcome of one assessment attempt. Percentage and band are constrained to their own evidence.';

create index competency_results_competency_idx on app.competency_results (competency_id);
create index competency_results_band_idx on app.competency_results (mastery_band);

-- ---------------------------------------------------------------------------
-- app.learning_path_items
-- ---------------------------------------------------------------------------
create table app.learning_path_items (
  path_item_id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references app.student_profiles (student_id)
    on update cascade
    on delete restrict,
  competency_id uuid not null
    references app.competencies (competency_id)
    on update cascade
    on delete restrict,
  module_id uuid not null
    references app.learning_modules (module_id)
    on update cascade
    on delete restrict,
  priority integer not null,
  reason text,
  status app.path_item_status not null default 'locked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One recommendation per competency, and one item per position, so the path
  -- is a genuine ordered list rather than a bag.
  constraint learning_path_items_student_competency_key unique (student_id, competency_id),
  constraint learning_path_items_student_priority_key unique (student_id, priority),

  constraint learning_path_items_priority_positive
    check (priority >= 1),
  constraint learning_path_items_reason_length
    check (reason is null or char_length(reason) <= 500),
  constraint learning_path_items_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.learning_path_items is
  'Ordered personalised recommendation linking a learner and a competency to a module, with the reason it was recommended.';

create index learning_path_items_student_order_idx
  on app.learning_path_items (student_id, priority);
create index learning_path_items_competency_idx on app.learning_path_items (competency_id);
create index learning_path_items_module_idx on app.learning_path_items (module_id);
create index learning_path_items_status_idx on app.learning_path_items (status);

create trigger learning_path_items_set_updated_at
  before update on app.learning_path_items
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.student_module_progress
-- ---------------------------------------------------------------------------
create table app.student_module_progress (
  progress_id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references app.student_profiles (student_id)
    on update cascade
    on delete restrict,
  module_id uuid not null
    references app.learning_modules (module_id)
    on update cascade
    on delete restrict,
  completion_percentage numeric(5,2) not null default 0,
  is_complete boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint student_module_progress_student_module_key unique (student_id, module_id),

  constraint student_module_progress_completion_range
    check (completion_percentage between 0 and 100),

  -- Completion is one fact expressed three ways, so the three must agree.
  constraint student_module_progress_complete_is_consistent
    check (
      (is_complete and completion_percentage = 100 and completed_at is not null)
      or (not is_complete and completion_percentage < 100 and completed_at is null)
    ),
  constraint student_module_progress_completed_not_before_started
    check (completed_at is null or started_at is null or completed_at >= started_at),
  constraint student_module_progress_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.student_module_progress is
  'Completion state for one learner and one module. The percentage, the flag and the completion timestamp are constrained to agree.';

create index student_module_progress_module_idx on app.student_module_progress (module_id);
create index student_module_progress_student_complete_idx
  on app.student_module_progress (student_id, is_complete);

create trigger student_module_progress_set_updated_at
  before update on app.student_module_progress
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- app.activity_attempts
-- ---------------------------------------------------------------------------
-- Note on mastery_status: the frozen documentation names this field but never
-- enumerates it, unlike mastery_band. It reuses app.mastery_band here because
-- that is the only mastery vocabulary the documentation defines. It is
-- deliberately not derived from score_percentage: passing an activity at its
-- own threshold does not move the display band unless the aggregate competency
-- score reaches that band, which is a different number.
create table app.activity_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references app.student_profiles (student_id)
    on update cascade
    on delete restrict,
  activity_id uuid not null
    references app.activities (activity_id)
    on update cascade
    on delete restrict,
  attempt_number integer not null,
  score_percentage numeric(5,2) not null,
  time_spent_seconds integer not null default 0,
  passed boolean not null,
  mastery_status app.mastery_band not null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- Attempts are retained, numbered, and never renumbered.
  constraint activity_attempts_student_activity_number_key
    unique (student_id, activity_id, attempt_number),

  constraint activity_attempts_attempt_number_positive
    check (attempt_number >= 1),
  constraint activity_attempts_score_range
    check (score_percentage between 0 and 100),
  constraint activity_attempts_time_spent_not_negative
    check (time_spent_seconds >= 0),
  -- A learner cannot spend more than a day on one activity attempt.
  constraint activity_attempts_time_spent_bounded
    check (time_spent_seconds <= 86400)
);

comment on table app.activity_attempts is
  'One retained practice attempt. attempt_number is unique per learner and activity, so history is never overwritten.';
comment on column app.activity_attempts.passed is
  'Deterministic comparison of score_percentage against the activity''s own mastery_threshold.';

create index activity_attempts_student_history_idx
  on app.activity_attempts (student_id, submitted_at desc);
create index activity_attempts_activity_idx on app.activity_attempts (activity_id);
create index activity_attempts_student_activity_idx
  on app.activity_attempts (student_id, activity_id, attempt_number);
create index activity_attempts_passed_idx on app.activity_attempts (passed);

-- ---------------------------------------------------------------------------
-- app.competency_progress
-- ---------------------------------------------------------------------------
create table app.competency_progress (
  progress_id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references app.student_profiles (student_id)
    on update cascade
    on delete restrict,
  competency_id uuid not null
    references app.competencies (competency_id)
    on update cascade
    on delete restrict,
  diagnostic_score numeric(5,2),
  current_score numeric(5,2),
  mastery_band app.mastery_band,
  attempt_count integer not null default 0,
  unsuccessful_attempts integer not null default 0,
  last_studied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The current aggregate, one row per learner and competency. History lives in
  -- app.assessment_attempts and app.activity_attempts and is never lost.
  constraint competency_progress_student_competency_key unique (student_id, competency_id),

  constraint competency_progress_diagnostic_score_range
    check (diagnostic_score is null or diagnostic_score between 0 and 100),
  constraint competency_progress_current_score_range
    check (current_score is null or current_score between 0 and 100),

  -- The band is the current score's band, or nothing when there is no score.
  constraint competency_progress_band_is_derived
    check (mastery_band is not distinct from app.mastery_band_for(current_score)),

  constraint competency_progress_attempt_count_not_negative
    check (attempt_count >= 0),
  constraint competency_progress_unsuccessful_attempts_range
    check (unsuccessful_attempts between 0 and attempt_count),

  constraint competency_progress_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.competency_progress is
  'Current deterministic aggregate per learner and competency, used by dashboards and intervention rules. Attempt history is retained elsewhere.';
comment on column app.competency_progress.unsuccessful_attempts is
  'Drives the configurable automatic intervention trigger. Can never exceed attempt_count.';

create index competency_progress_competency_idx on app.competency_progress (competency_id);
create index competency_progress_band_idx on app.competency_progress (mastery_band);
create index competency_progress_student_band_idx
  on app.competency_progress (student_id, mastery_band);
create index competency_progress_unsuccessful_idx
  on app.competency_progress (unsuccessful_attempts);

create trigger competency_progress_set_updated_at
  before update on app.competency_progress
  for each row
  execute function app.set_updated_at();
