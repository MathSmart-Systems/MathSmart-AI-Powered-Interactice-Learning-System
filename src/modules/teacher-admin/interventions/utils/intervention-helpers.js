/**
 * Deterministic helpers for the Teacher Interventions workspace.
 *
 * Everything here is computed from API evidence only. Groq never feeds these
 * decisions: severity ordering, status transitions, and score formatting are
 * the same whether or not AI assistance is configured.
 */

export const SEVERITY_ORDER = Object.freeze({ HIGH: 0, MEDIUM: 1, LOW: 2 });

export const INTERVENTION_TYPES = Object.freeze([
  "Additional Exercise",
  "One-on-One Remediation",
  "Additional Module",
  "Teacher Consultation",
  "Other",
]);

/**
 * Maps a severity label to its queue rank. Higher priority sorts first.
 *
 * @param {string|null|undefined} severity
 * @returns {number}
 */
export function severityRank(severity) {
  if (typeof severity === "string" && severity in SEVERITY_ORDER) {
    return SEVERITY_ORDER[severity];
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Sorts cases so HIGH precedes MEDIUM precedes LOW; equal severities fall back
 * to newest first. The list is returned as a new array and never mutated.
 *
 * @param {Array<object>} cases
 * @returns {Array<object>}
 */
export function sortCases(cases) {
  if (!Array.isArray(cases)) return [];
  return [...cases].sort((a, b) => {
    const bySeverity = severityRank(a?.severity) - severityRank(b?.severity);
    if (bySeverity !== 0) return bySeverity;
    const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

/**
 * Normalises a score value to a number in [0, 100], or null when absent.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizeScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Formats a score for display: `72%` or an em dash when there is no value.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function formatScore(value) {
  const score = normalizeScore(value);
  return score === null ? "—" : `${Math.round(score)}%`;
}

/**
 * One line after the learner's name on the queue row.
 *
 * @param {object} student
 * @param {string|null|undefined} student.grade_name
 * @param {string|null|undefined} student.section_name
 * @returns {string}
 */
export function studentContextLine(student) {
  const grade = typeof student?.grade_name === "string" ? student.grade_name : "";
  const section =
    typeof student?.section_name === "string" && student.section_name ? student.section_name : "";
  if (grade && section) return `${grade} – Section ${section}`;
  if (section) return `Section ${section}`;
  return grade || "Unassigned";
}

/**
 * The lifecycle transitions a case may take next, enforced deterministically.
 *
 * @param {string|null|undefined} status
 * @returns {Array<"In Progress"|"Resolved">}
 */
export function nextStatusOptions(status) {
  switch (status) {
    case "Needs Intervention":
    case "In Progress":
      return ["In Progress", "Resolved"];
    case "Resolved":
      return ["In Progress"];
    default:
      return [];
  }
}

/**
 * Whether moving a case to the given status opens it again (requires a reason).
 *
 * @param {string|null|undefined} newStatus
 * @returns {boolean}
 */
export function isReopen(newStatus) {
  return newStatus === "In Progress";
}

/**
 * Defensive normaliser for a queue row so a malformed reply degrades to a safe
 * empty shape instead of throwing downstream. Keeps the documented fields.
 *
 * @param {unknown} item
 * @returns {object}
 */
export function normalizeCase(item) {
  if (!item || typeof item !== "object") return {};
  const student = item.student || {};
  const competency = item.competency || {};
  return {
    id: item.id,
    student: {
      id: student.id ?? null,
      learner_id: student.learner_id ?? null,
      full_name: student.full_name ?? "Unknown learner",
      section_id: student.section_id ?? null,
      section_name: student.section_name ?? null,
      grade_name: student.grade_name ?? null,
    },
    competency: {
      id: competency.id ?? null,
      code: competency.code ?? null,
      name: competency.name ?? "Unknown competency",
    },
    severity: item.severity ?? null,
    status: item.status ?? null,
    intervention_type: item.intervention_type ?? null,
    evidence: {
      diagnostic_score: normalizeScore(item.evidence?.diagnostic_score),
      current_score: normalizeScore(item.evidence?.current_score),
      attempt_count: item.evidence?.attempt_count ?? 0,
      unsuccessful_attempts: item.evidence?.unsuccessful_attempts ?? 0,
    },
    recorded_by: item.recorded_by ?? null,
    recorded_at: item.recorded_at ?? null,
    created_at: item.created_at ?? null,
    resolved_at: item.resolved_at ?? null,
  };
}