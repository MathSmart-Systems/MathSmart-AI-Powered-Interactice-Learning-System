/**
 * The Teacher/Administrator dashboard as a plain object the view can render.
 *
 * Pure: no fetching, no React, no clock except where a caller passes one. Two
 * rules shape every function here.
 *
 * A missing number is not zero. The version this replaced turned null,
 * undefined and NaN into 0 in one helper that fed every count on the page, so
 * a partial reply read as "nobody in this class needs help". Here a missing
 * count is null, and the view shows "—".
 *
 * The page decides nothing. Mastery bands come from the API, which reads them
 * from `app.mastery_band_for` — the only definition of a band. The previous
 * model drew its own at 75 and 60 against the database's 80 and 50, so a class
 * averaging 77 was "Mastered" on the dashboard and "Developing" everywhere else.
 */

import { PREVIEW } from "./constants.js";

/** A whole count, or null when the reply did not carry one. */
export function count(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

/** A percentage rounded for display, or null when there is nothing to round. */
export function percent(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

/** "—" for a value nobody knows, the number otherwise — including zero. */
export function show(value, suffix = "") {
  return value === null || value === undefined ? "—" : `${value}${suffix}`;
}

/** Up to two initials, for the learner rows. */
export function initials(fullName) {
  const words = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

const MONITORING_LABELS = Object.freeze({
  active: "Learning",
  needs_intervention: "Needs support",
  improving: "Improving",
  mastered: "Mastered",
  inactive: "Inactive",
});

/**
 * A monitoring status in words, or null.
 *
 * The previous model invented `needs_intervention` for a learner with no status
 * at all, which put somebody on the support list for a missing field.
 */
export function monitoringLabel(status) {
  return MONITORING_LABELS[status] ?? null;
}

function normalizeLearner(learner) {
  return {
    id: String(learner?.student_id ?? ""),
    learnerId: learner?.learner_id ?? null,
    fullName: learner?.full_name ?? "Unnamed learner",
    initials: initials(learner?.full_name),
    sectionName: learner?.section_name ?? null,
    status: learner?.monitoring_status ?? null,
    statusLabel: monitoringLabel(learner?.monitoring_status),
    diagnosticScore: percent(learner?.diagnostic_score),
    currentScore: percent(learner?.overall_mastery),
    openCases: count(learner?.active_intervention_count),
  };
}

function normalizeCompetency(competency) {
  return {
    id: String(competency?.competency_id ?? ""),
    code: competency?.code ?? null,
    name: competency?.name ?? "Unnamed competency",
    learnersTracked: count(competency?.learners_tracked),
    mastered: count(competency?.mastered_count),
    developing: count(competency?.developing_count),
    needsImprovement: count(competency?.needs_improvement_count),
    average: percent(competency?.average_current_score),
    band: competency?.average_mastery_band ?? null,
    suppressed: Boolean(competency?.suppressed),
  };
}

/**
 * The competencies most worth a teacher's attention, weakest first.
 *
 * Ordered by how many learners are at Needs Improvement, then by the lowest
 * average the API was willing to publish. Both are the database's figures; the
 * ordering is the only thing decided here, and it decides nothing about a
 * learner.
 */
export function weakestFirst(competencies) {
  return [...competencies].sort((a, b) => {
    const needs = (b.needsImprovement ?? -1) - (a.needsImprovement ?? -1);
    if (needs !== 0) return needs;
    const left = a.average ?? Number.POSITIVE_INFINITY;
    const right = b.average ?? Number.POSITIVE_INFINITY;
    if (left !== right) return left - right;
    return String(a.code ?? "").localeCompare(String(b.code ?? ""));
  });
}

function normalizeActivity(item) {
  return {
    id: String(item?.id ?? ""),
    kind: item?.kind === "module" ? "module" : "assessment",
    studentId: item?.student_id ? String(item.student_id) : null,
    fullName: item?.full_name ?? "A learner",
    title: item?.title ?? "Untitled",
    score: percent(item?.score),
    occurredAt: item?.occurred_at ?? null,
  };
}

function normalizeSection(section) {
  return {
    id: String(section?.id ?? section?.section_id ?? ""),
    name: section?.name ?? section?.section_name ?? "Unnamed section",
    learnerCount: count(section?.learner_count),
  };
}

/**
 * The whole page, from one dashboard reply and the section directory.
 *
 * @param {object} [input]
 * @param {object|null} [input.dashboard] - `data` from GET /teacher-admin/dashboard
 * @param {Array} [input.sections] - `data` from GET /teacher-admin/classes
 * @param {string|null} [input.selectedSectionId]
 */
export function buildDashboardModel({ dashboard = null, sections = [], selectedSectionId = null } = {}) {
  const totals = dashboard?.totals ?? {};
  const diagnostic = dashboard?.diagnostic ?? {};
  const interventions = dashboard?.interventions ?? {};

  const sectionList = (Array.isArray(sections) ? sections : []).map(normalizeSection);
  const selectedSection = sectionList.find((section) => section.id === selectedSectionId) ?? null;

  const priority = (Array.isArray(dashboard?.priority_learners) ? dashboard.priority_learners : [])
    .map(normalizeLearner);

  const competencies = weakestFirst(
    (Array.isArray(dashboard?.competencies) ? dashboard.competencies : []).map(normalizeCompetency),
  );

  const tracked = competencies.filter((competency) => (competency.learnersTracked ?? 0) > 0);
  const learners = count(totals.learner_count);
  const diagnosticCompleted = count(diagnostic.completed);

  return {
    selectedSectionId: selectedSection ? selectedSection.id : null,
    selectedSection,
    sections: sectionList,
    summary: {
      learners,
      sections: count(totals.section_count),
      diagnosticCompleted,
      diagnosticInProgress: count(diagnostic.in_progress),
      diagnosticNotStarted: count(diagnostic.not_started),
      averageMastery: percent(totals.average_mastery),
      needsSupport: count(totals.needs_support_count),
    },
    interventions: {
      needsIntervention: count(interventions.needs_intervention),
      inProgress: count(interventions.in_progress),
      resolved: count(interventions.resolved),
    },
    priority: {
      total: priority.length,
      shown: priority.slice(0, PREVIEW.PRIORITY_LEARNERS),
    },
    competencies: {
      total: tracked.length,
      shown: tracked.slice(0, PREVIEW.COMPETENCIES),
      // Published but not yet started by anyone in this cohort. Counted, not
      // listed: a competency nobody has attempted has nothing to watch yet.
      untracked: competencies.length - tracked.length,
      // Said once for the whole list, instead of on every row.
      anySuppressed: tracked.some((competency) => competency.suppressed),
    },
    recentActivity: (Array.isArray(dashboard?.recent_activity) ? dashboard.recent_activity : [])
      .map(normalizeActivity),
    // A class nobody has joined yet. Known only when the reply said so: a
    // missing learner count is not an empty class.
    isEmpty: learners === 0,
  };
}
