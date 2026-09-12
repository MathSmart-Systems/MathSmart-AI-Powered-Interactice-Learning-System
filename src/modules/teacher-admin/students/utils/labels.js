/**
 * The words and badge tones MathSmart uses for learner statuses.
 *
 * The API returns sql enum values; a roster row renders a human label and a
 * badge variant instead. Each status carries label and tone together so colour
 * is never the only thing communicating the state, and the vocabulary matches
 * the learner-facing statuses in the student dashboard.
 */

/** `app.diagnostic_status` as a roster row reads it. */
export const DIAGNOSTIC_STATUS = Object.freeze({
  not_started: Object.freeze({ label: "Not started", variant: "outline" }),
  in_progress: Object.freeze({ label: "In progress", variant: "secondary" }),
  completed: Object.freeze({ label: "Completed", variant: "default" }),
});

export function diagnosticStatus(value) {
  return (
    DIAGNOSTIC_STATUS[value] ?? { label: "Not available", variant: "outline" }
  );
}

/** `app.monitoring_status` as a roster row reads it. */
export const MONITORING_STATUS = Object.freeze({
  active: Object.freeze({ label: "Active", variant: "secondary" }),
  needs_intervention: Object.freeze({
    label: "Needs intervention",
    variant: "destructive",
  }),
  improving: Object.freeze({ label: "Improving", variant: "outline" }),
  mastered: Object.freeze({ label: "Mastered", variant: "default" }),
  inactive: Object.freeze({ label: "Inactive", variant: "outline" }),
});

export function monitoringStatus(value) {
  return (
    MONITORING_STATUS[value] ??
    Object.freeze({ label: "Not available", variant: "outline" })
  );
}