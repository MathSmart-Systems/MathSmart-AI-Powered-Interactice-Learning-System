/**
 * Pure data transformation functions for the Teacher/Administrator Dashboard.
 */

import { MASTERY_THRESHOLDS } from "./constants.js";

/**
 * Formats a number to rounded integer or 0.
 *
 * @param {number|string|null} value
 * @returns {number}
 */
export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 0;
  }
  return Math.round(Number(value));
}

/**
 * Formats a score into a percentage string, e.g. "75%".
 *
 * @param {number|string|null} value
 * @returns {string}
 */
export function formatPercentage(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return `${Math.round(Number(value))}%`;
}

/**
 * Generates initials from a full name.
 *
 * @param {string} [name]
 * @returns {string}
 */
export function extractInitials(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Determines competency mastery status label.
 *
 * @param {number|null} score
 * @returns {"Mastered" | "Developing" | "Needs Support" | "Not Started"}
 */
export function getCompetencyMasteryBand(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return "Not Started";
  }
  const numeric = Number(score);
  if (numeric >= MASTERY_THRESHOLDS.MASTERED) return "Mastered";
  if (numeric >= MASTERY_THRESHOLDS.DEVELOPING) return "Developing";
  return "Needs Support";
}

/**
 * Normalizes cohort summary totals.
 *
 * @param {object} [rawTotals]
 * @returns {object}
 */
export function normalizeTotals(rawTotals = {}) {
  const totals = rawTotals || {};
  const learnerCount = formatNumber(totals.learner_count);
  const needsSupportCount = formatNumber(totals.needs_support_count);
  const activeCount = formatNumber(totals.active_count);
  const improvingCount = formatNumber(totals.improving_count);
  const masteredCount = formatNumber(totals.mastered_count);
  const openInterventionCount = formatNumber(totals.open_intervention_count);
  const rawAvg = totals.average_mastery;
  const averageMastery = rawAvg !== null && rawAvg !== undefined ? Number(rawAvg) : null;

  return {
    learnerCount,
    needsSupportCount,
    activeCount,
    improvingCount,
    masteredCount,
    openInterventionCount,
    averageMastery,
    averageMasteryFormatted: formatPercentage(averageMastery),
    publishedCompetencyCount: formatNumber(totals.published_competency_count),
    scoredAttemptCount: formatNumber(totals.scored_attempt_count),
    completedModuleCount: formatNumber(totals.completed_module_count),
  };
}

/**
 * Normalizes priority learners requiring attention.
 *
 * @param {Array} [rawLearners]
 * @returns {Array}
 */
export function normalizePriorityLearners(rawLearners = []) {
  if (!Array.isArray(rawLearners)) return [];

  return rawLearners.map((learner) => {
    const rawMastery = learner.overall_mastery;
    const mastery = rawMastery !== null && rawMastery !== undefined ? Number(rawMastery) : null;
    const rawDiagnostic = learner.diagnostic_score;
    const diagnostic = rawDiagnostic !== null && rawDiagnostic !== undefined ? Number(rawDiagnostic) : null;

    const activeInterventions = formatNumber(learner.active_intervention_count);

    return {
      studentId: String(learner.student_id || ""),
      learnerId: String(learner.learner_id || "N/A"),
      fullName: String(learner.full_name || "Unknown Learner"),
      initials: extractInitials(learner.full_name),
      gradeId: learner.grade_id ? String(learner.grade_id) : null,
      sectionId: learner.section_id ? String(learner.section_id) : null,
      sectionName: String(learner.section_name || "Grade 6 Section"),
      diagnosticScore: diagnostic,
      diagnosticFormatted: formatPercentage(diagnostic),
      overallMastery: mastery,
      overallMasteryFormatted: formatPercentage(mastery),
      monitoringStatus: String(learner.monitoring_status || "needs_intervention"),
      activeInterventionCount: activeInterventions,
      attemptSummary:
        activeInterventions > 0
          ? `${activeInterventions} active intervention${activeInterventions > 1 ? "s" : ""}`
          : "Action required",
    };
  });
}

/**
 * Normalizes competency overview items.
 *
 * @param {Array} [rawCompetencies]
 * @returns {Array}
 */
export function normalizeCompetencies(rawCompetencies = []) {
  if (!Array.isArray(rawCompetencies)) return [];

  return rawCompetencies.map((comp) => {
    const learnersTracked = formatNumber(comp.learners_tracked);
    const rawAvg = comp.average_current_score;
    // Use the backend's explicit suppression flag — it is the authoritative source
    // (backend: service.suppressed() withholds averages for cohorts < 5 learners).
    const isSuppressed = Boolean(comp.suppressed);
    const averageScore = rawAvg !== null && rawAvg !== undefined ? Number(rawAvg) : null;

    return {
      competencyId: String(comp.competency_id || ""),
      code: String(comp.code || "COMP"),
      name: String(comp.name || "Competency"),
      domain: String(comp.domain || "Mathematics"),
      learnersTracked,
      masteredCount: formatNumber(comp.mastered_count),
      developingCount: formatNumber(comp.developing_count),
      needsImprovementCount: formatNumber(comp.needs_improvement_count),
      averageScore,
      averageFormatted: isSuppressed ? "Withheld (Small Cohort)" : formatPercentage(averageScore),
      isSuppressed,
      masteryBand: getCompetencyMasteryBand(averageScore),
    };
  });
}

/**
 * Builds the complete dashboard view model.
 *
 * @param {object} params
 * @param {object} [params.totals]
 * @param {Array} [params.competencies]
 * @param {Array} [params.priorityLearners]
 * @param {Array} [params.sections]
 * @param {string|null} [params.selectedSectionId]
 * @returns {object}
 */
export function buildDashboardModel({
  totals = {},
  competencies = [],
  priorityLearners = [],
  sections = [],
  selectedSectionId = null,
} = {}) {
  const normalizedTotals = normalizeTotals(totals);
  const normalizedCompetencies = normalizeCompetencies(competencies);
  const normalizedPriority = normalizePriorityLearners(priorityLearners);

  const normalizedSections = Array.isArray(sections)
    ? sections.map((sec) => ({
        id: String(sec.id || ""),
        name: String(sec.name || "Section"),
        gradeId: sec.grade_id ? String(sec.grade_id) : null,
        learnerCount: formatNumber(sec.learner_count),
        adviserName: sec.adviser?.full_name ? String(sec.adviser.full_name) : null,
      }))
    : [];

  const selectedSection =
    normalizedSections.find((s) => s.id === selectedSectionId) || null;

  const hasData =
    normalizedTotals.learnerCount > 0 ||
    normalizedCompetencies.length > 0 ||
    normalizedPriority.length > 0;

  return {
    totals: normalizedTotals,
    competencies: normalizedCompetencies,
    priorityLearners: normalizedPriority,
    sections: normalizedSections,
    selectedSectionId,
    selectedSection,
    hasData,
  };
}
