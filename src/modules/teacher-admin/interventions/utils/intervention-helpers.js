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
  if (typeof severity === "string" && Object.hasOwn(SEVERITY_ORDER, severity)) {
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
  if (!Number.isFinite(number)) return null;
  return Math.min(100, Math.max(0, number));
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
      return ["In Progress"];
    case "In Progress":
      return ["Resolved"];
    case "Resolved":
      return ["In Progress"];
    default:
      return [];
  }
}

/**
 * Whether a transition opens a case again, which requires an educator-written
 * reason. Only a resolved case reopens; taking up a case that still needs
 * intervention is the normal first step and needs no reason.
 *
 * @param {string|null|undefined} currentStatus
 * @param {string|null|undefined} newStatus
 * @returns {boolean}
 */
export function isReopen(currentStatus, newStatus) {
  return currentStatus === "Resolved" && newStatus === "In Progress";
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
  // Learner names and competency names are free text, and a spreadsheet reads a
  // leading =, +, -, @, tab, or carriage return as the start of a formula. Such
  // a cell gets an apostrophe prefix before quoting (CWE-1236).
  const formulaStart = /^[=+\-@\t\r]/;
  const escape = (value) => {
    const raw = value === null || value === undefined ? "" : String(value);
    const text = formulaStart.test(raw) ? `'${raw}` : raw;
    return text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")
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
/** Cap matching the backend's MAX_ATTEMPTS so a request can never exceed it. */
const MAX_AI_EVIDENCE_ITEMS = 20;

/**
 * Builds the bounded evidence for the advisory `/ai/teacher-insight` call from
 * one case detail. Arrays are capped at the backend limit and scores are
 * normalised numbers; nothing here can carry a learner name, because the key
 * names sent upstream must survive the adapter's evidence redaction.
 *
 * @param {object|null|undefined} detail - The case detail object
 * @returns {object}
 */
export function buildCaseAIEvidence(detail) {
  const evidence = detail?.evidence ?? {};
  const list = (value) => (Array.isArray(value) ? value.slice(0, MAX_AI_EVIDENCE_ITEMS) : []);
  return {
    competencyId: detail?.competency?.id ?? null,
    diagnosticScore: normalizeScore(evidence.diagnostic_score),
    currentScore: normalizeScore(evidence.current_score),
    attemptCount: evidence.attempt_count ?? 0,
    unsuccessfulAttempts: evidence.unsuccessful_attempts ?? 0,
    incorrectPatterns: list(detail?.incorrect_patterns),
    completedModules: list(detail?.modules_attempted),
  };
}

/**
 * Builds the bounded evidence for the advisory `/ai/remediation-support` call.
 * The display context is a short, PII-free sentence about the case's own
 * deterministic state; it never references the learner by name.
 *
 * @param {object|null|undefined} detail - The case detail object
 * @returns {object}
 */
export function buildRemediationContext(detail) {
  const parts = [];
  if (detail?.severity) parts.push(`Case severity: ${String(detail.severity).toUpperCase()}.`);
  if (detail?.status) parts.push(`Status: ${String(detail.status)}.`);
  if (parts.length === 0) parts.push("An intervention case is being reviewed.");
  return {
    competencyId: detail?.competency?.id ?? null,
    currentScore: normalizeScore(detail?.evidence?.current_score),
    displayContext: parts.join(" ").slice(0, 2000),
  };
}

/**
 * Reads one advisory reply into the shape the panels render, or null when
 * nothing usable came back. Disabled (503 groq_assistance_unavailable),
 * timeouts, network failure, and malformed or empty text all collapse to null,
 * which is the graceful fallback the deterministic UI is built on.
 *
 * @param {object} result - The normalised API client reply
 * @param {"insight_summary"|"recommended_module_title"|"misconception_summary"} textKey
 * @returns {{text: string, provider: string, model: string, generatedAt: string}|null}
 */
export function readAdvisory(result, textKey) {
  if (!result || typeof result !== "object") return null;
  const data = result.ok && result.data && typeof result.data === "object" ? result.data : null;
  if (!data) return null;
  const text = typeof data[textKey] === "string" ? data[textKey].trim() : "";
  if (!text) return null;
  return {
    text,
    provider: typeof data.provider === "string" ? data.provider : null,
    model: typeof data.model === "string" ? data.model : null,
    generatedAt: typeof data.generated_at === "string" ? data.generated_at : null,
  };
}

/**
 * Formats a provenance timestamp for display, or an em dash when absent.
 *
 * @param {string|null|undefined} value - ISO-8601 timestamp
 * @returns {string}
 */
export function formatGeneratedAt(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * One provenance line for an advisory block: `provider · model · when`, with
 * whichever parts are present. Returns null when nothing is available.
 *
 * @param {object|null} advisory
 * @returns {string|null}
 */
export function provenanceLabel(advisory) {
  if (!advisory) return null;
  const when = formatGeneratedAt(advisory.generatedAt);
  const parts = [advisory.provider, advisory.model, when !== "—" ? when : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Builds the bounded body for the advisory `/ai/pattern-analysis` call from the
 * filtered queue. Neither grade nor competency scope is present (or the queue is
 * empty), the panel stays quiet: there is no class to summarise. The display
 * context aggregates severity and status counts only and states that no learner
 * identity is included; the queue never feeds names or per-question attempts,
 * because neither would satisfy this contract without leaking identity.
 *
 * @param {Array<object>} cases
 * @param {object} [scope]
 * @param {string|null} [scope.gradeId]
 * @param {string|null} [scope.competencyId]
 * @param {Array<object>} [scope.grades]
 * @returns {object|null}
 */
export function buildClassPatternAnalysisPayload(
  cases,
  { gradeId = null, competencyId = null, grades = [] } = {}
) {
  if (!Array.isArray(cases) || cases.length === 0) return null;
  if (!gradeId && !competencyId) return null;

  const severities = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const statuses = {};
  for (const item of cases) {
    const severity = item?.severity;
    if (severity in severities) severities[severity] += 1;
    const status = item?.status ?? "Unknown";
    statuses[status] = (statuses[status] ?? 0) + 1;
  }

  const severityLine = `Severity: ${severities.HIGH} HIGH, ${severities.MEDIUM} MEDIUM, ${severities.LOW} LOW.`;
  const statusLine = `Status: ${Object.entries(statuses)
    .map(([name, count]) => `${count} ${name}`)
    .join(", ")}.`;
  const displayContext = [
    `A teacher is reviewing ${cases.length} intervention case${cases.length === 1 ? "" : "s"} in this scope.`,
    severityLine,
    statusLine,
    "No individually identifying learner details are included.",
  ].join(" ");

  const gradeRecord = Array.isArray(grades)
    ? grades.find((grade) => grade?.id && String(grade.id) === String(gradeId))
    : null;

  const grade = typeof gradeRecord?.name === "string" ? gradeRecord.name.slice(0, 60) : null;

  // A grade filter that no directory entry resolves would leave the payload
  // with no scope at all, which this advisory contract does not accept.
  if (!grade && !competencyId) return null;

  return {
    grade,
    competencyId,
    displayContext: displayContext.slice(0, 2000),
    incorrectAttempts: [],
  };
}

/**
 * The trailing seven-day reporting window (`now` inclusive), used by the weekly
 * summary. Deterministic: computed from timestamps only, never from AI.
 *
 * @param {Date} [now]
 * @returns {{start: Date, end: Date}}
 */
export function weekWindow(now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/**
 * Whether a timestamp falls inside a reporting window. Absent or malformed
 * values are never counted.
 *
 * @param {string|null|undefined} value
 * @param {{start: Date, end: Date}} window
 * @returns {boolean}
 */
export function inWindow(value, window) {
  if (!value || !window) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= window.start && date <= window.end;
}

/**
 * Deterministic weekly summary over a batch of cases. Counts activity in the
 * trailing seven days plus the current unresolved and high-priority-open load,
 * so a teacher can see the week at a glance and export it.
 *
 * @param {Array<object>} cases
 * @param {Date} [now]
 * @returns {object}
 */
export function weeklySummary(cases, now = new Date()) {
  const window = weekWindow(now);
  const list = Array.isArray(cases) ? cases : [];
  const opened = list.filter((item) => inWindow(item?.created_at, window));
  const resolved = list.filter((item) => inWindow(item?.resolved_at, window));
  const unresolved = list.filter((item) => item?.status !== "Resolved");
  const highOpen = unresolved.filter((item) => item?.severity === "HIGH");
  return {
    window,
    total: list.length,
    openedCount: opened.length,
    resolvedCount: resolved.length,
    unresolvedCount: unresolved.length,
    highOpenCount: highOpen.length,
    openedCases: opened,
    resolvedCases: resolved,
  };
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