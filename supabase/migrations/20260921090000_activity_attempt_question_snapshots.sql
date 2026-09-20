-- Freeze the exact question set delivered to each activity attempt.
--
-- Assessments have been snapshot-protected since
-- `20260910110000_assessment_attempt_question_snapshots.sql`: the questions an
-- attempt was started with, and the keys it will be graded against, are copied
-- into `app.assessment_responses` at the moment it begins, and grading reads
-- that copy.
--
-- Activities had none of it. `app.submit_activity_attempt` inserted a row for
-- every *current* member of `app.activity_questions`, then graded every
-- response against the *live* `app.questions.answer_key`, and took `max_score`
-- from the number of rows it ended up with. Three things followed, and all
-- three were silent:
--
--   * A question added to the activity mid-attempt was inserted with a null
--     answer and graded wrong — a learner was marked down on an item they were
--     never shown.
--   * A question removed from the activity mid-attempt kept the row it already
--     had and was still counted in `max_score`.
--   * An answer key corrected mid-attempt regraded answers already given.
--
-- The same copy also fixes delivery. `app.check_activity_answer` and
-- `app.activity_hint` read the live question for the key, the explanation and
-- the hint, so archiving a question changed what a learner in the middle of an
-- activity was told about an answer they had already committed to.
--
-- Nothing here changes an existing rule. The key stays server-only: the
-- snapshot column holding it is granted to nobody, exactly as
-- `assessment_responses.grading_answer_key` is.

begin;

-- ---------------------------------------------------------------------------
-- The snapshot columns
-- ---------------------------------------------------------------------------
alter table app.activity_attempts
  add column question_snapshot_created_at timestamptz,
  add column question_snapshot_count integer;

alter table app.activity_attempts
  add constraint activity_attempts_snapshot_count_positive
    check (question_snapshot_count is null or question_snapshot_count >= 1),
  add constraint activity_attempts_snapshot_is_consistent
    check (
      (question_snapshot_created_at is null and question_snapshot_count is null)
      or
      (question_snapshot_created_at is not null and question_snapshot_count is not null)
    );

comment on column app.activity_attempts.question_snapshot_count is
  'How many questions were frozen for this attempt. Grading refuses to proceed unless it graded exactly this many.';

-- Remove the table-wide read before adding the confidential columns. The safe
-- columns are granted back explicitly at the end of this migration.
--
-- `app.activity_responses` was the one learner table still holding a table-wide
-- SELECT for `authenticated`, which `app.assessment_responses` gave up in
-- `20260910110000`. That grant already exposed `is_correct` to any direct query
-- on the Data API role, which the assessment side deliberately withholds.
revoke select on app.activity_responses from authenticated;

alter table app.activity_responses
  add column question_version integer,
  add column delivered_position integer,
  add column delivered_competency_id uuid
    references app.competencies (competency_id)
    on update restrict
    on delete restrict,
  add column delivered_payload jsonb,
  -- Server-only, all three. The learner sees the explanation only through
  -- `app.check_activity_answer`, after committing an answer, and the hint only
  -- through `app.activity_hint`.
  add column grading_answer_key jsonb,
  add column delivered_explanation text,
  add column delivered_hint text;

alter table app.activity_responses
  add constraint activity_responses_question_version_positive
    check (question_version is null or question_version >= 1),
  add constraint activity_responses_delivered_position_positive
    check (delivered_position is null or delivered_position >= 1),
  add constraint activity_responses_delivered_payload_object
    check (delivered_payload is null or jsonb_typeof(delivered_payload) = 'object'),
  -- The same guard the assessment payload carries, reusing the same function:
  -- a delivered payload may never contain a key, a correct answer, an
  -- explanation, a hint or a verdict.
  add constraint activity_responses_delivered_payload_no_solution
    check (
      delivered_payload is null
      or not app.assessment_payload_has_confidential_key(delivered_payload)
    ),
  add constraint activity_responses_grading_key_present
    check (grading_answer_key is null or grading_answer_key <> 'null'::jsonb);

create unique index activity_responses_attempt_position_key
  on app.activity_responses (attempt_id, delivered_position)
  where delivered_position is not null;

create index activity_responses_delivered_competency_idx
  on app.activity_responses (delivered_competency_id);

comment on column app.activity_responses.delivered_payload is
  'The learner-safe question exactly as it was delivered. Constrained against ever holding a solution.';
comment on column app.activity_responses.grading_answer_key is
  'Server-only. The key this response will be graded against, frozen when the attempt began.';

-- ---------------------------------------------------------------------------
-- Privileges: the safe columns, and only those
-- ---------------------------------------------------------------------------
-- `is_correct` is deliberately absent, matching `app.assessment_responses`.
-- The backend reads a learner's saved answers as the caller and needs only the
-- question and the answer; the verdict reaches them through the answer-check
-- function, which decides when it may.
grant select (
  response_id, attempt_id, question_id, answer, check_count, hint_issued_at,
  question_version, delivered_position, delivered_competency_id, delivered_payload,
  created_at, updated_at
) on app.activity_responses to authenticated;

commit;
