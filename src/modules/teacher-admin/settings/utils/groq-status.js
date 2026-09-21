/**
 * The Groq part of the settings reply, read without assuming anything.
 *
 * Groq is on only when two separate things are true: the server has it
 * switched on (a deployment value in `.env`, which this screen can neither see
 * nor change), and the classroom setting a Teacher/Administrator controls
 * here. The reply reports both, and this keeps them apart so the screen can
 * say which one is holding it back.
 *
 * Anything missing reads as off. A screen that assumed "on" when the API said
 * nothing would promise advice the server is not going to give.
 */

/** The three states a teacher is shown. */
export const GROQ_STATUS = Object.freeze({
  ENABLED: "enabled",
  DISABLED: "disabled",
  UNAVAILABLE: "unavailable",
});

const STATUS_VALUES = new Set(Object.values(GROQ_STATUS));

/**
 * @param {object|null|undefined} data - The `data` of GET /teacher-admin/settings
 * @returns {{serverConfigured: boolean, classroomEnabled: boolean, status: string, model: string|null}}
 */
export function readGroqStatus(data) {
  const groq = data?.groq && typeof data.groq === "object" ? data.groq : {};

  const serverConfigured = groq.server === "configured";
  const classroomEnabled = groq.classroom_enabled === true;

  let status = STATUS_VALUES.has(groq.status) ? groq.status : null;
  if (!status) {
    if (!serverConfigured) status = GROQ_STATUS.UNAVAILABLE;
    else status = classroomEnabled ? GROQ_STATUS.ENABLED : GROQ_STATUS.DISABLED;
  }

  const model = serverConfigured && typeof groq.model === "string" && groq.model.trim()
    ? groq.model.trim()
    : null;

  return { serverConfigured, classroomEnabled, status, model };
}

/**
 * The status after the classroom setting has been changed here, without
 * waiting for another read: the server half cannot have moved.
 *
 * @param {ReturnType<typeof readGroqStatus>} current
 * @param {boolean} classroomEnabled
 */
export function withClassroomSetting(current, classroomEnabled) {
  let status = GROQ_STATUS.UNAVAILABLE;
  if (current.serverConfigured) {
    status = classroomEnabled ? GROQ_STATUS.ENABLED : GROQ_STATUS.DISABLED;
  }
  return { ...current, classroomEnabled, status };
}

/** What the teacher reads for each state. */
export const GROQ_STATUS_TEXT = Object.freeze({
  [GROQ_STATUS.ENABLED]: {
    label: "Enabled",
    detail: "Optional AI suggestions can be requested.",
  },
  [GROQ_STATUS.DISABLED]: {
    label: "Disabled",
    detail: "Turned off for this school. No AI suggestions are requested.",
  },
  [GROQ_STATUS.UNAVAILABLE]: {
    label: "Unavailable",
    detail: "Groq is not set up on the server, so no AI suggestions can be requested.",
  },
});

const SETTING_NAMES = {
  "thresholds.activity_pass_percentage": "Default activity pass threshold",
  "intervention.unsuccessful_attempts": "Intervention alert trigger",
  "features.groq_advisory": "AI suggestions",
  "features.groq_enabled": "AI suggestions",
  "features.groq_feedback_enabled": "AI suggestions",
};

function describeValue(key, value) {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (value === null || value === undefined) return "not set";
  if (key === "thresholds.activity_pass_percentage") return `${value}%`;
  if (key === "intervention.unsuccessful_attempts") {
    return `${value} ${Number(value) === 1 ? "try" : "tries"}`;
  }
  return String(value);
}

/**
 * One audit record as lines a teacher can read.
 *
 * Newer records carry each change with its value before and after. Older ones
 * carry only the keys, and the same setting could appear under two names;
 * those are shown once each, without values, rather than guessed at.
 *
 * @param {object|null|undefined} details - `audit_events.details`
 * @returns {string[]}
 */
export function describeSettingsAudit(details) {
  const changes = Array.isArray(details?.changes) ? details.changes : null;
  if (changes && changes.length > 0) {
    return changes
      .filter((change) => typeof change?.key === "string")
      .map((change) => {
        const name = SETTING_NAMES[change.key] ?? change.key;
        return `${name} changed from ${describeValue(change.key, change.from)} to ${describeValue(change.key, change.to)}`;
      });
  }

  const keys = Array.isArray(details?.updated_keys) ? details.updated_keys : [];
  return [...new Set(keys.map((key) => SETTING_NAMES[key] ?? key))];
}
