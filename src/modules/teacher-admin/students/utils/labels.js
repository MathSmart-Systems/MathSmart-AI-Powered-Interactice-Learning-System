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

/**
 * `app.account_status` as a roster row reads it.
 *
 * Only a dropped learner is worth saying out loud: an active account is the
 * unremarkable case, and a badge on every row would be noise.
 */
export const ACCOUNT_STATUS = Object.freeze({
  active: null,
  suspended: Object.freeze({ label: "Suspended", variant: "outline" }),
  archived: Object.freeze({ label: "Dropped", variant: "destructive" }),
});

export function accountStatus(value) {
  return ACCOUNT_STATUS[value] ?? null;
}

/** Whether this learner has been dropped from the school. */
export function isDropped(learner) {
  return learner?.account_status === "archived";
}

/**
 * The one status a roster row shows.
 *
 * Access outranks monitoring. A dropped learner's `monitoring_status` is
 * retired to `inactive` when they are dropped, but even so there must be a
 * single place that decides, or a row ends up saying "Active" and "Dropped" at
 * the same time — which is what it used to do, with the account state as a
 * second badge beside a monitoring state that contradicted it.
 *
 * So: archived reads Dropped, suspended reads Suspended, and only an account
 * that is actually usable reports how its learner is being monitored.
 */
export function learnerStatus(learner) {
  const account = accountStatus(learner?.account_status);
  if (account) return account;
  return monitoringStatus(learner?.monitoring_status);
}
