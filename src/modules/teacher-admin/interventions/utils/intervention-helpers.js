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
 * Boilerplate educator-note templates. Selecting one fills the record form's
 * notes field so the teacher can review and edit before submitting; nothing is
 * submitted, decided, or written by these strings.
 */
export const INTERVENTION_TEMPLATES = Object.freeze([
  {
    name: "Number Line Review",
    notes:
      "Guided number-line review session; modelled the sign rules on an anchor chart and had the learner verbalise each step.",
  },
  {
    name: "One-on-One Session",
    notes:
      "15-minute one-on-one remediation; scaffolds the target skill into small steps and checks understanding after each step.",
  },
  {
    name: "Peer Pairing",
    notes:
      "Assigned a peer tutor for partnered practice during Aral time. Will verify progress on the next short check.",
  },
  {
    name: "Additional Module",
    notes:
      "Assigned the practice module for extra work at home. Scheduled to review the results in the next session.",
  },
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
 * The cases among `cases` that may move to `status` without reopening. A reopen
 * from Resolved back to In Progress always needs an educator-written reason, so
 * bulk and quick actions never perform it implicitly.
 *
 * @param {Array<object>} cases
 * @param {"In Progress"|"Resolved"} status
 * @returns {Array<object>}
 */
export function eligibleForStatus(cases, status) {
  if (!Array.isArray(cases)) return [];
  return cases.filter((item) => {
    if (status === "In Progress" && item?.status === "In Progress") return false;
    if (status === "Resolved" && item?.status === "Resolved") return false;
    if (status === "In Progress" && item?.status === "Resolved") return false;
    return nextStatusOptions(item?.status).includes(status);
  });
}

/**
 * Renders a value as a short date (`Sep 19, 2026`) or an em dash when absent.
 *
 * @param {string|null|undefined} value - ISO timestamp or date
 * @returns {string}
 */
export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Builds a CSV document for the given queue rows, for the "Export selected"
 * action. Deterministic: only already-displayed evidence is written, and no
 * generative text is ever included.
 *
 * @param {Array<object>} cases
 * @returns {string}
 */
export function casesToCsv(cases) {
  const header = [
    "intervention_id",
    "student_id",
    "learner_name",
    "learner_id",
    "section",
    "competency_code",
    "competency",
    "severity",
    "status",
    "intervention_type",
    "diagnostic_score",
    "current_score",
    "score_drop",
    "attempt_count",
    "unsuccessful_attempts",
    "created_at",
    "recorded_by",
  ];
  const escape = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return text.includes(",") || text.includes('"') || text.includes("\n")
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };
  const rows = (Array.isArray(cases) ? cases : []).map((item) => {
    const student = item.student ?? {};
    const competency = item.competency ?? {};
    const evidence = item.evidence ?? {};
    return [
      item.id,
      student.id,
      student.full_name,
      student.learner_id,
      student.section_name,
      competency.code,
      competency.name,
      item.severity,
      item.status,
      item.intervention_type,
      formatScore(evidence.diagnostic_score).replace("%", ""),
      formatScore(evidence.current_score).replace("%", ""),
      scoreDrop(item),
      evidence.attempt_count ?? 0,
      evidence.unsuccessful_attempts ?? 0,
      item.created_at,
      item.recorded_by,
    ].map(escape).join(",");
  });
  return [header.join(","), ...rows].join("\r\n");
}

/**
 * Downloads `text` as a UTF-8 CSV file. Browser-only; resolves immediately in
 * non-browser environments so tests can call it safely.
 *
 * @param {string} text
 * @param {string} filename
 */
export function downloadCsv(text, filename) {
  if (typeof document === "undefined") return;
  const blob = new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "mathsmart-interventions.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * The diagnostic-to-current score drop for a case, or 0 when either score is
 * missing. Used to filter the queue deterministically (`min_score_drop`), never
 * derived from AI.
 *
 * @param {object} item
 * @returns {number}
 */
export function scoreDrop(item) {
  const diagnostic = normalizeScore(item?.evidence?.diagnostic_score);
  const current = normalizeScore(item?.evidence?.current_score);
  if (diagnostic === null || current === null) return 0;
  return Math.max(0, diagnostic - current);
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
    educator_notes: item.educator_notes ?? null,
    reopen_reason: item.reopen_reason ?? null,
  };
}