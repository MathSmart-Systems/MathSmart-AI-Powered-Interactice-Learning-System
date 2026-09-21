/**
 * The words MathSmart uses for the statuses the API returns.
 *
 * Every status a learner sees is written out, so a colour, a tint or a bar is
 * never the only thing carrying the meaning. The vocabulary is deliberately
 * plain and never diagnostic-sounding: a Grade 6 learner reads "Getting extra
 * help", not "needs_intervention".
 */

/** `app.diagnostic_status` as a learner reads it. */
export const DIAGNOSTIC_STATUS = Object.freeze({
  not_started: Object.freeze({
    label: "Not started",
    summary: "Your diagnostic sets the starting point for everything below.",
  }),
  in_progress: Object.freeze({
    label: "In progress",
    summary: "You have started your diagnostic. Finish it to unlock your path.",
  }),
  completed: Object.freeze({
    label: "Completed",
    // Only what is true. A finished diagnostic does not mean a path exists
    // yet, and this sentence used to promise one to learners who had none.
    summary: "Your diagnostic is done.",
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

/** `app.path_item_status` as a learner reads it. */
export const PATH_ITEM_STATUS = Object.freeze({
  locked: Object.freeze({ label: "Opens later", verb: "Open" }),
  available: Object.freeze({ label: "Ready to start", verb: "Start" }),
  in_progress: Object.freeze({ label: "In progress", verb: "Continue" }),
  completed: Object.freeze({ label: "Finished", verb: "Review" }),
});

export function pathItemStatus(value) {
  return PATH_ITEM_STATUS[value] ?? { label: "Ready to start", verb: "Open" };
}

/**
 * `app.mastery_band` with a shape as well as a name.
 *
 * `fill` is how many quarters of the band glyph are drawn, so the three bands
 * differ by outline, fill and label at once rather than by colour alone.
 */
export const MASTERY_BAND = Object.freeze({
  Mastered: Object.freeze({ label: "Mastered", fill: 3 }),
  Developing: Object.freeze({ label: "Developing", fill: 2 }),
  "Needs Improvement": Object.freeze({ label: "Needs practice", fill: 1 }),
});

export function masteryBand(value) {
  return MASTERY_BAND[value] ?? { label: "Not scored yet", fill: 0 };
}

/**
 * `app.monitoring_status` turned into the one calm message worth interrupting
 * a learner for, or `null` when the interface should stay quiet.
 */
export function supportNotice({ monitoringStatus, openInterventionCount = 0 }) {
  // `openInterventionCount` is the learner's own count, from a function that
  // returns one number and nothing else. The words below are all a learner is
  // told: never a severity, a reason, a status or what a teacher wrote.
  if (openInterventionCount > 0 || monitoringStatus === "needs_intervention") {
    return {
      tone: "support",
      heading: "Your teacher is preparing extra support for your learning",
      body: "Some topics take more time, and that is normal. Keep going with your next step, and your teacher will help you with the rest.",
    };
  }

  if (monitoringStatus === "inactive") {
    return {
      tone: "support",
      heading: "Welcome back",
      body: "It has been a while since your last piece of work. Pick up the next step below and your path carries on from where you stopped.",
    };
  }

  if (monitoringStatus === "mastered") {
    return {
      tone: "praise",
      heading: "Every tracked competency is mastered",
      body: "You have reached the mastered band across the competencies MathSmart is following for you. Your teacher will add the next ones.",
    };
  }

  return null;
}
