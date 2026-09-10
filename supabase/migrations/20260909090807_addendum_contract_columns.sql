-- MathSmart Phase 5a — API contract addendum, part 2 of 3.
--
-- Columns the frozen route contract returns, filters on, or requires, which the
-- entity-relationship diagram never modelled. As in part 1, each is justified by
-- a documented requirement quoted above it, and no frozen document was edited.

-- ---------------------------------------------------------------------------
-- app.activity_attempts — an attempt now exists before it is submitted
-- ---------------------------------------------------------------------------
-- Starting an activity attempt must return `status: "in_progress"`,
-- `saved_answers` and `started_at`, and "a repeated request must resume instead
-- of creating a second in-progress attempt". The table could only hold a
-- finished attempt: score, pass flag, mastery status and submission time were
-- all NOT NULL, so an in-progress attempt was unrepresentable and the attempt
-- identifier the answer-check and submit endpoints are addressed by could never
-- exist.
--
-- The lifecycle now mirrors app.assessment_attempts, which already worked this
-- way, so both attempt kinds behave identically.
alter table app.activity_attempts
  add column status app.attempt_status not null default 'in_progress',
  add column started_at timestamptz not null default now(),
  -- The submit response returns `score` and `max_score` as raw marks alongside
  -- the accuracy percentage; only the percentage was stored.
  add column raw_score integer,
  add column max_score integer,
  -- "Published attempts retain the content version used when submitted."
  add column activity_version integer;

alter table app.activity_attempts
  alter column score_percentage drop not null,
  alter column passed drop not null,
  alter column mastery_status drop not null,
  alter column submitted_at drop not null,
  -- An unsubmitted attempt must not be stamped with a submission time.
  alter column submitted_at drop default;

alter table app.activity_attempts
  add constraint activity_attempts_in_progress_is_unfinished
    check (
      status <> 'in_progress'
      or (submitted_at is null
          and score_percentage is null
          and raw_score is null
          and max_score is null
          and passed is null
          and mastery_status is null)
    ),
  add constraint activity_attempts_finished_has_submitted_at
    check (status not in ('submitted', 'scored') or submitted_at is not null),
  add constraint activity_attempts_scored_has_result
    check (
      status <> 'scored'
      or (score_percentage is not null and passed is not null and mastery_status is not null)
    ),
  add constraint activity_attempts_submitted_not_before_started
    check (submitted_at is null or submitted_at >= started_at),
  add constraint activity_attempts_max_score_positive
    check (max_score is null or max_score >= 1),
  add constraint activity_attempts_raw_score_range
    check (raw_score is null or max_score is null or raw_score between 0 and max_score),
  -- The stored accuracy must agree with the stored marks, exactly as competency
  -- results already do.
  add constraint activity_attempts_score_is_derived
    check (
      raw_score is null
      or max_score is null
      or score_percentage is null
      or score_percentage = app.percentage_for(raw_score, max_score)
    ),
  add constraint activity_attempts_version_positive
    check (activity_version is null or activity_version >= 1);

comment on column app.activity_attempts.status is
  'Attempt lifecycle. An attempt exists from the moment a learner starts it, so answers can be saved and checked before submission.';
comment on column app.activity_attempts.raw_score is
  'Deterministic raw marks. score_percentage is constrained to agree with raw_score over max_score.';
comment on column app.activity_attempts.activity_version is
  'The activity version this attempt was taken against, so republishing cannot rewrite the meaning of history.';

-- A learner resumes rather than starting a second attempt.
create unique index activity_attempts_one_in_progress_key
  on app.activity_attempts (student_id, activity_id)
  where status = 'in_progress';

create index activity_attempts_status_idx on app.activity_attempts (status);

-- ---------------------------------------------------------------------------
-- app.assessment_attempts — content pinning and an audited void
-- ---------------------------------------------------------------------------
-- "Published attempts retain the content version used when submitted", and the
-- diagnostic-reset endpoint voids an attempt "with a required reason". The
-- voided status existed with nowhere to record who voided it or why.
alter table app.assessment_attempts
  add column assessment_version integer,
  add column voided_reason text,
  add column voided_by uuid
    references app.teacher_admin_profiles (teacher_admin_id)
    on update cascade
    on delete restrict,
  add column voided_at timestamptz;

alter table app.assessment_attempts
  add constraint assessment_attempts_version_positive
    check (assessment_version is null or assessment_version >= 1),
  add constraint assessment_attempts_voided_is_accountable
    check (
      (status = 'voided' and voided_reason is not null and voided_by is not null and voided_at is not null)
      or (status <> 'voided' and voided_reason is null and voided_by is null and voided_at is null)
    ),
  add constraint assessment_attempts_voided_reason_not_blank
    check (voided_reason is null or btrim(voided_reason) <> ''),
  add constraint assessment_attempts_voided_not_before_started
    check (voided_at is null or voided_at >= started_at);

comment on column app.assessment_attempts.voided_reason is
  'Required pedagogical reason recorded when an educator voids an attempt. A voided attempt always names its reason and its actor.';

-- "Published attempts retain the content version used when submitted."
alter table app.assessment_responses
  add column question_version integer;

alter table app.assessment_responses
  add constraint assessment_responses_question_version_positive
    check (question_version is null or question_version >= 1);

-- ---------------------------------------------------------------------------
-- Content columns the contract returns
-- ---------------------------------------------------------------------------
-- The assessment detail endpoint returns a description.
alter table app.assessments
  add column description text;

alter table app.assessments
  add constraint assessments_description_length
    check (description is null or char_length(description) <= 4000);

-- Question delivery "may contain … accessible visual-aid metadata", and
-- question authoring "validates … accessible visual-aid description". This is
-- an accessibility requirement, and it is safe to expose: unlike answer_key,
-- explanation and hint, it describes the question rather than its solution.
alter table app.questions
  add column visual_aid_description text;

alter table app.questions
  add constraint questions_visual_aid_description_length
    check (visual_aid_description is null or char_length(visual_aid_description) <= 1000);

comment on column app.questions.visual_aid_description is
  'Accessible text alternative for a question''s visual aid. Safe to deliver before submission; it describes the question, not the answer.';

-- ---------------------------------------------------------------------------
-- Account and learner columns
-- ---------------------------------------------------------------------------
-- User administration lists "by role/status/search", changes "approved
-- role/status fields", and archives rather than deletes. The learner profile
-- endpoints read and write `preferences`.
alter table app.user_profiles
  add column account_status app.account_status not null default 'active',
  add column archived_at timestamptz,
  add column preferences jsonb not null default '{}'::jsonb;

alter table app.user_profiles
  add constraint user_profiles_archived_matches_status
    check (
      (account_status = 'archived' and archived_at is not null)
      or (account_status <> 'archived' and archived_at is null)
    ),
  add constraint user_profiles_archived_not_before_created
    check (archived_at is null or archived_at >= created_at),
  add constraint user_profiles_preferences_is_object
    check (jsonb_typeof(preferences) = 'object'),
  -- Learner preferences are display settings, never a place for a token.
  add constraint user_profiles_preferences_is_not_a_secret
    check (not app.looks_like_a_secret(preferences));

comment on column app.user_profiles.account_status is
  'Account access state. Distinct from student monitoring_status, which describes learning rather than access.';

create index user_profiles_account_status_idx on app.user_profiles (account_status);

-- Registration accepts `school_name` for a learner, and the roster filters and
-- learner summary shape both carry `diagnostic_status`.
alter table app.student_profiles
  add column school_name text,
  add column diagnostic_status app.diagnostic_status not null default 'not_started';

alter table app.student_profiles
  add constraint student_profiles_school_name_not_blank
    check (school_name is null or btrim(school_name) <> ''),
  add constraint student_profiles_school_name_length
    check (school_name is null or char_length(school_name) between 2 and 160);

comment on column app.student_profiles.diagnostic_status is
  'Deterministic diagnostic progress, maintained by the backend from attempt evidence. Stored rather than derived so the documented roster filter can be indexed.';

create index student_profiles_diagnostic_status_idx on app.student_profiles (diagnostic_status);

-- ---------------------------------------------------------------------------
-- Module section progress
-- ---------------------------------------------------------------------------
-- Module progress is updated with `completed_section_ids` and `last_section_id`,
-- and completing a module "validates required sections" before it may succeed.
alter table app.student_module_progress
  add column completed_section_ids jsonb not null default '[]'::jsonb,
  add column last_section_id text;

alter table app.student_module_progress
  add constraint student_module_progress_sections_is_array
    check (jsonb_typeof(completed_section_ids) = 'array'),
  add constraint student_module_progress_sections_are_strings
    check (not jsonb_path_exists(completed_section_ids, '$[*] ? (@.type() != "string")')),
  add constraint student_module_progress_last_section_length
    check (last_section_id is null or char_length(last_section_id) between 1 and 120);

-- ---------------------------------------------------------------------------
-- Advisory provenance on interventions
-- ---------------------------------------------------------------------------
-- "Store AI provenance, confidence, and generated time when advice influences a
-- teacher-facing recommendation. Keep human notes distinct from AI output."
--
-- Note the distinction from configuration: the Groq model may not be stored in
-- app.system_settings, which rejects it by constraint, because that would make
-- it selectable. Recording which model produced a specific stored sentence is
-- provenance of an artefact, not configuration, and the documentation requires
-- it. The credential is never stored anywhere.
alter table app.interventions
  add column ai_provider text,
  add column ai_model text,
  add column ai_confidence_score numeric(4,3),
  add column ai_generated_at timestamptz,
  -- "A resolved case may reopen to In Progress with a required reason."
  add column reopen_reason text;

alter table app.interventions
  add constraint interventions_ai_confidence_range
    check (ai_confidence_score is null or ai_confidence_score between 0 and 1),
  add constraint interventions_ai_provider_length
    check (ai_provider is null or char_length(ai_provider) between 1 and 60),
  add constraint interventions_ai_model_length
    check (ai_model is null or char_length(ai_model) between 1 and 120),
  add constraint interventions_reopen_reason_length
    check (reopen_reason is null or char_length(reopen_reason) between 3 and 1000),
  -- Provenance accompanies advice; it never stands alone.
  add constraint interventions_ai_provenance_needs_advice
    check (
      (ai_provider is null and ai_model is null
       and ai_confidence_score is null and ai_generated_at is null)
      or (ai_insight is not null or ai_recommendation is not null)
    ),
  add constraint interventions_ai_generated_not_before_created
    check (ai_generated_at is null or ai_generated_at >= created_at);

comment on column app.interventions.ai_model is
  'Provenance of a stored advisory sentence: which model produced it. Not configuration, and never selectable through the API.';
