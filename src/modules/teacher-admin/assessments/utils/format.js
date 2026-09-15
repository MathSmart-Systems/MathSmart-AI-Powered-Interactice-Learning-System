/**
 * Display helpers for assessment administration.
 *
 * These return labels, icon names and Badge variants — never raw colour
 * classes. Status treatment belongs to the shared Badge primitive and the
 * theme tokens behind it, so one decision covers every screen that shows an
 * assessment's state.
 */

/** The only types app.assessment_type holds. */
export const ASSESSMENT_TYPES = Object.freeze([
  { value: "diagnostic", label: "Diagnostic" },
  { value: "reassessment", label: "Reassessment" },
  { value: "unit_quiz", label: "Unit quiz" },
]);

const TYPE_LABELS = new Map(ASSESSMENT_TYPES.map((type) => [type.value, type.label]));

/**
 * Formats a duration in minutes for reading.
 *
 * @param {number|string|null|undefined} minutes
 * @returns {string}
 */
export function formatDuration(minutes) {
  const value = typeof minutes === "string" ? Number(minutes) : minutes;

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "—";
  }

  const whole = Math.floor(value);
  if (whole < 60) {
    return `${whole} min${whole === 1 ? "" : "s"}`;
  }

  const hours = Math.floor(whole / 60);
  const remainder = whole % 60;
  const hourPart = `${hours} hr${hours === 1 ? "" : "s"}`;

  return remainder === 0
    ? hourPart
    : `${hourPart} ${remainder} min${remainder === 1 ? "" : "s"}`;
}

/**
 * An assessment's publication state, as the interface shows it.
 *
 * `tone` names a Badge variant and `icon` names the shape beside the label, so
 * the state is never carried by colour alone.
 *
 * @param {string|null|undefined} status
 * @returns {{ value: string, label: string, tone: string, icon: string, description: string }}
 */
export function formatAssessmentStatus(status) {
  const normalized = typeof status === "string" ? status.toLowerCase().trim() : "";

  switch (normalized) {
    case "published":
      return {
        value: "published",
        label: "Published",
        tone: "default",
        icon: "published",
        description: "Deliverable to learners",
      };
    case "archived":
      return {
        value: "archived",
        label: "Archived",
        tone: "secondary",
        icon: "archived",
        description: "Withdrawn, and kept for history",
      };
    case "draft":
    default:
      return {
        value: "draft",
        label: "Draft",
        tone: "outline",
        icon: "draft",
        description: "Not yet delivered to anyone",
      };
  }
}

/**
 * Formats an assessment type for reading.
 *
 * An unrecognised value is shown as it came rather than renamed, so a data
 * problem stays visible instead of looking like a diagnostic assessment.
 *
 * @param {string|null|undefined} type
 * @returns {string}
 */
export function formatAssessmentType(type) {
  if (typeof type !== "string" || !type.trim()) {
    return "—";
  }

  const normalized = type.trim().toLowerCase();
  return TYPE_LABELS.get(normalized) ?? type.trim();
}

/**
 * Formats a question count, including the state that blocks publication.
 *
 * @param {number|null|undefined} count
 * @returns {string}
 */
export function formatQuestionCount(count) {
  const value = Number(count);
  if (!Number.isFinite(value) || value <= 0) {
    return "No questions";
  }
  return `${value} question${value === 1 ? "" : "s"}`;
}

// Day-first, as Philippine school records are written, and resolved in the
// school's own time zone so an evening edit never reads as yesterday's.
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Manila",
});

/**
 * Formats a timestamp as a date.
 *
 * @param {string|Date|null|undefined} value
 * @returns {string}
 */
export function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  // Node 22 / ICU renders en-GB's short month for September as "Sept".
  // Standardise to canonical 3-letter "Sep" matching school record standards.
  return DATE_FORMAT.format(date).replace("Sept", "Sep");
}
