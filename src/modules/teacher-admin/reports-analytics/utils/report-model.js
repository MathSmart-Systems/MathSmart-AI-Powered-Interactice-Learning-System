/**
 * The overview reply, made ready to show.
 *
 * Every figure is the server's. Nothing here counts, averages or ranks
 * learners; the one ordering it applies — competencies by learning need — is
 * the order the server already sent, kept. It only rounds for display, says
 * "Hidden" where the server withheld an average for a small group, and "—"
 * where a value is genuinely missing. A real zero is always shown as 0.
 */

import { STATUS_OPTIONS } from "./report-filters.js";

/** How many competencies the overview shows before "View all". */
export const COMPETENCY_PREVIEW = 5;

export const HIDDEN = "Hidden";
export const MISSING = "—";

/** A count, or null when the reply did not carry one. Zero stays zero. */
export function count(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

/** A percentage rounded to a whole number, the same rule the dashboard uses. */
export function percent(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

/** Text for a percentage: a number, "Hidden" when withheld, "—" when missing. */
export function showPercent(value, { withheld = false } = {}) {
  if (withheld) return HIDDEN;
  const rounded = percent(value);
  return rounded === null ? MISSING : `${rounded}%`;
}

/** Text for a count, where zero is a real answer. */
export function showCount(value) {
  const number = count(value);
  return number === null ? MISSING : String(number);
}

/** Growth in points, signed: "+14 pts", "−5 pts", "0 pts". */
export function showGrowth(value, { withheld = false } = {}) {
  if (withheld) return HIDDEN;
  const rounded = percent(value);
  if (rounded === null) return MISSING;
  if (rounded > 0) return `+${rounded} pts`;
  if (rounded < 0) return `−${Math.abs(rounded)} pts`;
  return "0 pts";
}

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((option) => [option.value, option.label]));

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? null;
}

function competency(row) {
  const withheld = row?.suppressed === true;
  const tracked = count(row?.learners_tracked) ?? 0;
  const bands = {
    mastered: count(row?.mastered_count) ?? 0,
    developing: count(row?.developing_count) ?? 0,
    needsImprovement: count(row?.needs_improvement_count) ?? 0,
  };
  return {
    id: row?.competency_id ?? null,
    code: row?.code ?? null,
    name: row?.name ?? "Untitled competency",
    tracked,
    bands,
    // Each band as a share of the learners tracked, for the bar's widths.
    shares:
      tracked > 0
        ? {
            mastered: (bands.mastered / tracked) * 100,
            developing: (bands.developing / tracked) * 100,
            needsImprovement: (bands.needsImprovement / tracked) * 100,
          }
        : null,
    average: showPercent(row?.average_current, { withheld }),
    growth: showGrowth(row?.growth, { withheld }),
    band: withheld ? null : (row?.average_band ?? null),
    withheld,
  };
}

/**
 * @param {object|null|undefined} overview - `data` of GET /teacher-admin/reports/overview
 */
export function buildReportModel(overview) {
  const summary = overview?.summary ?? {};
  const diagnostic = summary.diagnostic ?? {};
  const activity = overview?.activity ?? {};
  const cases = overview?.interventions ?? {};
  const watch = overview?.watch_list ?? {};
  const averagesWithheld = summary.averages_suppressed === true;

  const learners = count(summary.learner_count);
  const competencies = (Array.isArray(overview?.competencies) ? overview.competencies : []).map(
    competency,
  );
  const withProgress = competencies.filter((row) => row.tracked > 0);

  const activityAttempts = count(activity.activity_attempts);
  const activityPassed = count(activity.activity_passed);

  return {
    minimumForAverage: count(overview?.privacy?.minimum_learners_for_average) ?? 5,
    summary: {
      learners,
      needsSupport: count(summary.needs_support_count),
      diagnosticCompleted: count(diagnostic.completed),
      diagnosticInProgress: count(diagnostic.in_progress),
      diagnosticNotStarted: count(diagnostic.not_started),
      averageCurrent: showPercent(summary.average_current, { withheld: averagesWithheld }),
      averageDiagnostic: showPercent(summary.average_diagnostic, { withheld: averagesWithheld }),
      growth: showGrowth(summary.average_growth, { withheld: averagesWithheld }),
      averagesWithheld,
    },
    competencies: {
      all: competencies,
      // Those with progress lead, in the server's order of learning need.
      preview: withProgress.slice(0, COMPETENCY_PREVIEW),
      total: competencies.length,
      withProgress: withProgress.length,
    },
    sections: (Array.isArray(overview?.sections) ? overview.sections : []).map((row) => ({
      id: row?.section_id ?? null,
      name: row?.name ?? "Unnamed section",
      learners: count(row?.learner_count),
      needsSupport: count(row?.needs_support_count),
      diagnosticCompleted: count(row?.diagnostic_completed),
      average: showPercent(row?.average_current, { withheld: row?.suppressed === true }),
      diagnosticAverage: showPercent(row?.average_diagnostic, { withheld: row?.suppressed === true }),
    })),
    activity: {
      assessmentsScored: count(activity.assessments_scored),
      assessmentAverage: showPercent(activity.assessment_average, {
        withheld: activity.assessment_average === null && count(activity.assessments_scored) > 0,
      }),
      activityAttempts,
      activityPassed,
      activityAverage: showPercent(activity.activity_average, {
        withheld: activity.activity_average === null && activityAttempts > 0,
      }),
      modulesCompleted: count(activity.modules_completed),
    },
    mostMissed: (Array.isArray(overview?.most_missed) ? overview.most_missed : []).map((row) => ({
      id: row?.question_id ?? null,
      competencyCode: row?.competency_code ?? null,
      prompt: row?.prompt ?? "",
      answered: count(row?.answered),
      incorrect: count(row?.incorrect),
      learners: count(row?.learners_answered),
      commonWrongAnswer: row?.common_wrong_answer ?? null,
      commonWrongCount: count(row?.common_wrong_count),
    })),
    interventions: {
      needsIntervention: count(cases.needs_intervention),
      inProgress: count(cases.in_progress),
      resolved: count(cases.resolved),
      openedInRange: count(cases.opened_in_range),
      resolvedInRange: count(cases.resolved_in_range),
      medianDays:
        cases.median_days_to_resolve === null || cases.median_days_to_resolve === undefined
          ? null
          : Number(cases.median_days_to_resolve),
    },
    watchList: {
      rows: (Array.isArray(watch.rows) ? watch.rows : []).map((row) => ({
        id: row?.student_id ?? null,
        learnerId: row?.learner_id ?? null,
        name: row?.full_name ?? "Unnamed learner",
        section: row?.section_name ?? null,
        status: row?.monitoring_status ?? null,
        statusLabel: statusLabel(row?.monitoring_status),
        diagnostic: showPercent(row?.diagnostic_average),
        current: showPercent(row?.current_average),
        openCases: count(row?.open_intervention_count) ?? 0,
      })),
      total: count(watch.total) ?? 0,
      page: count(watch.page) ?? 1,
      pageSize: count(watch.page_size) ?? 10,
    },
    isEmpty: learners === 0,
  };
}

/** Pages of the learner list, from the reply's own total. */
export function pageCount(watchList) {
  if (!watchList.total || !watchList.pageSize) return 1;
  return Math.max(1, Math.ceil(watchList.total / watchList.pageSize));
}
