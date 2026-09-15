/**
 * The words the profile uses for the statuses the API returns.
 *
 * A status is always written out, so a tile, a heading or a tint is never the
 * only thing carrying the meaning. The vocabulary stays plain and calm, the
 * same register the dashboard uses: a Grade 6 learner reads "Getting extra
 * help", not "needs_intervention".
 */

/** `app.diagnostic_status` as a learner reads it, with an explanation. */
export const DIAGNOSTIC_STATUS = Object.freeze({
  not_started: Object.freeze({
    label: "Not started",
    summary: "Your diagnostic sets your starting point and builds your path.",
  }),
  in_progress: Object.freeze({
    label: "In progress",
    summary: "You have started your diagnostic. Finishing it opens your learning path.",
  }),
  completed: Object.freeze({
    label: "Completed",
    summary: "Your diagnostic is done, so your learning path is ready.",
  }),
});

export function diagnosticStatus(value) {
  return (
    DIAGNOSTIC_STATUS[value] ?? {
      label: "Not available",
      summary: "Your diagnostic status will appear here once your teacher sets it up.",
    }
  );
}

/** `app.monitoring_status` as a learner reads it, with an explanation. */
export const MONITORING_STATUS = Object.freeze({
  active: Object.freeze({
    label: "Active",
    summary: "Your learning record is active and your teacher can see your progress.",
  }),
  needs_intervention: Object.freeze({
    label: "Getting extra help",
    summary:
      "Some skills are taking longer, and your teacher is planning support for you. Nothing here is a mark against you.",
  }),
  improving: Object.freeze({
    label: "Improving",
    summary: "Your recent work is showing progress across the skills you practice.",
  }),
  mastered: Object.freeze({
    label: "Mastered",
    summary: "Every skill MathSmart tracks for you has reached the mastered band.",
  }),
  inactive: Object.freeze({
    label: "On hold",
    summary: "This learning record is paused. Talk to your teacher when you are ready to continue.",
  }),
});

export function monitoringStatus(value) {
  return (
    MONITORING_STATUS[value] ?? {
      label: "Not available",
      summary: "Your learning status will appear here once your teacher sets it up.",
    }
  );
}