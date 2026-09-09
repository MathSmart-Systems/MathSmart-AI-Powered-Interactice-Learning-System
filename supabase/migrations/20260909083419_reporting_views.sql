-- MathSmart Phase 4 — interventions and reporting, part 4 of 4.
--
-- Secure reporting views.
--
-- Why views rather than summary tables
-- ------------------------------------
-- Every figure below is derivable from authoritative deterministic records, so
-- persisting a second copy would only create something that can disagree with
-- the evidence. These are views over the base tables, computed on read.
--
-- Why security_invoker
-- --------------------
-- A view is created by the migration owner, and a plain Postgres view runs with
-- the owner's rights, which would hand out every row the base tables' policies
-- exist to withhold. Each view below is declared `security_invoker = true`, so
-- it executes with the caller's own rights and the base-table policies still
-- decide which rows it can see. The same query therefore returns school-wide
-- figures to a Teacher/Administrator and only the caller's own figures to a
-- learner, with no branching in the view itself.
--
-- None of these views touch app.questions, so no answer key, explanation or
-- hint can leak through reporting.

-- ---------------------------------------------------------------------------
-- Per-learner performance
-- ---------------------------------------------------------------------------
create view app.student_performance_summary
with (security_invoker = true) as
select
  student_profiles.student_id,
  student_profiles.learner_id,
  user_profiles.full_name,
  student_profiles.grade_id,
  student_profiles.section_id,
  student_profiles.monitoring_status,
  (select round(avg(competency_progress.diagnostic_score), 2)
     from app.competency_progress
    where competency_progress.student_id = student_profiles.student_id) as diagnostic_average,
  (select round(avg(competency_progress.current_score), 2)
     from app.competency_progress
    where competency_progress.student_id = student_profiles.student_id) as current_average,
  (select count(*)
     from app.competency_progress
    where competency_progress.student_id = student_profiles.student_id
      and competency_progress.mastery_band = 'Mastered') as competencies_mastered,
  (select count(*)
     from app.student_module_progress
    where student_module_progress.student_id = student_profiles.student_id
      and student_module_progress.is_complete) as modules_completed,
  (select count(*)
     from app.student_module_progress
    where student_module_progress.student_id = student_profiles.student_id) as modules_started,
  (select count(*)
     from app.assessment_attempts
    where assessment_attempts.student_id = student_profiles.student_id
      and assessment_attempts.status = 'scored') as scored_attempt_count,
  (select coalesce(max(competency_progress.unsuccessful_attempts), 0)
     from app.competency_progress
    where competency_progress.student_id = student_profiles.student_id) as worst_unsuccessful_attempts,
  -- A learner reads zero here, because the intervention policy gives them no
  -- rows. That is the intended safe subset.
  (select count(*)
     from app.interventions
    where interventions.student_id = student_profiles.student_id
      and interventions.archived_at is null
      and interventions.status <> 'Resolved') as open_intervention_count,
  (select max(competency_progress.last_studied_at)
     from app.competency_progress
    where competency_progress.student_id = student_profiles.student_id) as last_studied_at
from app.student_profiles
join app.user_profiles on user_profiles.user_id = student_profiles.user_id;

comment on view app.student_performance_summary is
  'Per-learner performance derived from authoritative records. security_invoker, so a learner sees only their own row.';

-- ---------------------------------------------------------------------------
-- Per-competency mastery
-- ---------------------------------------------------------------------------
create view app.competency_mastery_summary
with (security_invoker = true) as
select
  competencies.competency_id,
  competencies.code,
  competencies.name,
  competencies.domain,
  competencies.grade_id,
  competencies.status,
  count(competency_progress.progress_id) as learners_tracked,
  count(*) filter (where competency_progress.mastery_band = 'Mastered') as mastered_count,
  count(*) filter (where competency_progress.mastery_band = 'Developing') as developing_count,
  count(*) filter (where competency_progress.mastery_band = 'Needs Improvement') as needs_improvement_count,
  round(avg(competency_progress.current_score), 2) as average_current_score,
  round(avg(competency_progress.diagnostic_score), 2) as average_diagnostic_score
from app.competencies
left join app.competency_progress
  on competency_progress.competency_id = competencies.competency_id
group by
  competencies.competency_id,
  competencies.code,
  competencies.name,
  competencies.domain,
  competencies.grade_id,
  competencies.status;

comment on view app.competency_mastery_summary is
  'Mastery distribution per competency. security_invoker, so a learner contributes and sees only their own progress row.';

-- ---------------------------------------------------------------------------
-- Per-section cohort
-- ---------------------------------------------------------------------------
create view app.section_performance_summary
with (security_invoker = true) as
select
  sections.section_id,
  sections.grade_id,
  sections.name as section_name,
  sections.adviser_id,
  sections.is_active,
  count(student_profiles.student_id) as learner_count,
  count(*) filter (where student_profiles.monitoring_status = 'active') as active_count,
  count(*) filter (where student_profiles.monitoring_status = 'needs_intervention') as needs_intervention_count,
  count(*) filter (where student_profiles.monitoring_status = 'improving') as improving_count,
  count(*) filter (where student_profiles.monitoring_status = 'mastered') as mastered_count,
  count(*) filter (where student_profiles.monitoring_status = 'inactive') as inactive_count,
  (select round(avg(competency_progress.current_score), 2)
     from app.competency_progress
     join app.student_profiles as section_learners
       on section_learners.student_id = competency_progress.student_id
    where section_learners.section_id = sections.section_id) as average_current_score
from app.sections
left join app.student_profiles
  on student_profiles.section_id = sections.section_id
group by
  sections.section_id,
  sections.grade_id,
  sections.name,
  sections.adviser_id,
  sections.is_active;

comment on view app.section_performance_summary is
  'Cohort rollup per section. security_invoker, so a learner can only ever resolve their own section and their own row within it.';

-- ---------------------------------------------------------------------------
-- Intervention queue
-- ---------------------------------------------------------------------------
create view app.intervention_status_summary
with (security_invoker = true) as
select
  interventions.status,
  interventions.severity,
  count(*) as case_count,
  count(*) filter (where interventions.archived_at is not null) as archived_count,
  count(*) filter (where interventions.ai_insight is not null) as ai_assisted_count,
  min(interventions.created_at) as oldest_created_at,
  max(interventions.recorded_at) as latest_recorded_at
from app.interventions
group by interventions.status, interventions.severity;

comment on view app.intervention_status_summary is
  'Intervention queue rollup by lifecycle status and severity. security_invoker, so a learner reads nothing from it.';

-- ---------------------------------------------------------------------------
-- Teacher/Administrator dashboard
-- ---------------------------------------------------------------------------
create view app.teacher_dashboard_summary
with (security_invoker = true) as
select
  (select count(*) from app.student_profiles) as learner_count,
  (select count(*) from app.student_profiles
    where student_profiles.monitoring_status = 'active') as active_count,
  (select count(*) from app.student_profiles
    where student_profiles.monitoring_status = 'needs_intervention') as needs_support_count,
  (select count(*) from app.student_profiles
    where student_profiles.monitoring_status = 'improving') as improving_count,
  (select count(*) from app.student_profiles
    where student_profiles.monitoring_status = 'mastered') as mastered_count,
  (select round(avg(competency_progress.current_score), 2)
     from app.competency_progress) as average_mastery,
  (select count(*) from app.interventions
    where interventions.archived_at is null
      and interventions.status <> 'Resolved') as open_intervention_count,
  (select count(*) from app.competencies
    where competencies.status = 'published') as published_competency_count,
  (select count(*) from app.assessment_attempts
    where assessment_attempts.status = 'scored') as scored_attempt_count,
  (select count(*) from app.student_module_progress
    where student_module_progress.is_complete) as completed_module_count;

comment on view app.teacher_dashboard_summary is
  'School-wide dashboard rollup. security_invoker, so the same query returns only the caller''s own figures to a learner.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Anonymous callers reach nothing, as everywhere else. `authenticated` may read
-- the views, but reading one still requires privileges on the base tables,
-- which is what keeps a reporting view from becoming a way around them.
revoke all on app.student_performance_summary   from public, anon, authenticated;
revoke all on app.competency_mastery_summary    from public, anon, authenticated;
revoke all on app.section_performance_summary   from public, anon, authenticated;
revoke all on app.intervention_status_summary   from public, anon, authenticated;
revoke all on app.teacher_dashboard_summary     from public, anon, authenticated;

grant select on app.student_performance_summary to authenticated, service_role;
grant select on app.competency_mastery_summary  to authenticated, service_role;
grant select on app.section_performance_summary to authenticated, service_role;
grant select on app.intervention_status_summary to authenticated, service_role;
grant select on app.teacher_dashboard_summary   to authenticated, service_role;
