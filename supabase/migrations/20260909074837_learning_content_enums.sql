-- MathSmart Phase 2 — learning content, part 1 of 3.
--
-- The controlled vocabularies the curriculum tables depend on, plus the helper
-- that decides whether the caller may see unpublished content.
--
-- Every value below is the canonical one from the frozen documentation. Nothing
-- is invented here, and no curriculum content is created by this phase.

-- Draft, published and archived apply to every authored curriculum entity:
-- competencies, learning modules, questions, assessments and activities.
create type app.publication_status as enum ('draft', 'published', 'archived');

comment on type app.publication_status is
  'Canonical publication lifecycle for authored curriculum content.';

-- The MVP delivers multiple_choice, number_input and fill_blank. The remaining
-- three values are reserved in the data contract so the schema does not need a
-- migration when accessible interaction and grading support land; nothing may
-- publish a question that uses one until then.
create type app.question_type as enum (
  'multiple_choice',
  'number_input',
  'fill_blank',
  'true_false',
  'matching',
  'ordering'
);

comment on type app.question_type is
  'Question interaction types. multiple_choice, number_input and fill_blank are the MVP set; the rest are reserved for later activation.';

create type app.question_difficulty as enum ('easy', 'medium', 'hard');

comment on type app.question_difficulty is
  'Canonical authored difficulty of a question-bank item.';

create type app.assessment_type as enum ('diagnostic', 'reassessment', 'unit_quiz');

comment on type app.assessment_type is
  'Canonical assessment kinds.';

-- ---------------------------------------------------------------------------
-- Content visibility helper
-- ---------------------------------------------------------------------------
-- A learner may consume published content only. A Teacher/Administrator reads
-- every publication state so drafts and archives can be authored and audited.
--
-- Plain STABLE SQL, not SECURITY DEFINER, and its search_path is pinned.
create function app.can_read_content(content_status app.publication_status)
returns boolean
language sql
stable
set search_path = ''
as $$
  select content_status = 'published'::app.publication_status
      or app.is_teacher_admin();
$$;

comment on function app.can_read_content(app.publication_status) is
  'True when the caller may read content in the given publication state: published for anyone signed in, any state for a teacher_admin.';

revoke all on function app.can_read_content(app.publication_status) from public;
grant execute on function app.can_read_content(app.publication_status) to authenticated, service_role;
