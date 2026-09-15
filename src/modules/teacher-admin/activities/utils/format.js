/**
 * Display helpers for activity administration.
 *
 * These return labels, icon names and Badge variants — never raw colour
 * classes. Status treatment belongs to the shared Badge primitive and the
 * theme tokens behind it, so one decision covers every screen that shows an
 * activity's state.
 */

/**
 * Formats an activity's duration in minutes for reading.
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
 * An activity's publication state, as the interface shows it.
 *
 * `tone` names a Badge variant and `icon` names the shape beside the label, so
 * the state is never carried by colour alone.
 *
 * @param {string|null|undefined} status
 * @returns {{ value: string, label: string, tone: string, icon: string, description: string }}
 */
export function formatActivityStatus(status) {
  const normalized = typeof status === "string" ? status.toLowerCase().trim() : "";

  switch (normalized) {
    case "published":
      return {
        value: "published",
        label: "Published",
        tone: "default",
        icon: "published",
        description: "Available for learner practice",
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
        description: "Not yet available to learners",
      };
  }
}

/**
 * Formats points awarded for activity completion.
 *
 * @param {number|string|null|undefined} points
 * @returns {string}
 */
export function formatPoints(points) {
  const value = typeof points === "string" ? Number(points) : points;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "0 pts";
  }
  return `${Math.floor(value)} pt${Math.floor(value) === 1 ? "" : "s"}`;
}

/**
 * Formats the mastery pass percentage threshold.
 *
 * @param {number|string|null|undefined} threshold
 * @returns {string}
 */
export function formatMasteryThreshold(threshold) {
  const value = typeof threshold === "string" ? Number(threshold) : threshold;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 100) {
    return "75% to pass";
  }
  return `${Math.floor(value)}% to pass`;
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
