/**
 * Whether a published activity would actually start for a learner.
 *
 * `is_ready` on a listing row is the API's own answer to "would a learner's
 * start request succeed": the activity is published, it holds at least one
 * question, every one of those questions is published, and its learning module
 * and that module's competency are published too. Three activities were once
 * published holding nothing at all, the workspace showed them as plain
 * "Published", and learners were offered a Start button that failed — the
 * teacher had no way to tell those rows from the working ones.
 *
 * `is_ready` is a single boolean, so it says that something is missing without
 * saying which piece. This file turns what the row does carry into the most
 * specific sentence it can honestly write, and stops at what it knows when it
 * cannot name the dependency: a wrong specific sentence would send a teacher to
 * fix the wrong thing.
 *
 * Nothing here changes data. Naming the missing piece is the teacher's cue to
 * act on it; MathSmart never publishes a question, a competency or a module on
 * their behalf.
 */

/** The dependency that is holding an activity back, when the row names one. */
export const READINESS_REASONS = Object.freeze({
  NO_QUESTIONS: "no_questions",
  DRAFT_QUESTION: "draft_question",
  DRAFT_COMPETENCY: "draft_competency",
  DRAFT_MODULE: "draft_module",
  UNKNOWN: "unknown",
});

/**
 * One sentence naming the missing piece, and one explaining what it costs.
 *
 * The headline is what a teacher scanning the list reads; the detail is why it
 * matters and what to do instead. Neither of them depends on colour, and
 * neither of them is phrased as an instruction MathSmart could carry out
 * itself.
 */
const REASON_COPY = Object.freeze({
  [READINESS_REASONS.NO_QUESTIONS]: {
    headline: "No questions yet",
    detail:
      "A learner who starts this activity is handed nothing to answer and is then scored " +
      "zero, and that zero counts toward the rule that opens an intervention. Choose its " +
      "questions and it works.",
  },
  [READINESS_REASONS.DRAFT_QUESTION]: {
    headline: "A question is still a draft",
    detail:
      "A draft question is never delivered, so the activity runs short or empty. Publish " +
      "that question in the Question Bank, or swap it for one that is already published.",
  },
  [READINESS_REASONS.DRAFT_COMPETENCY]: {
    headline: "A question's competency is still a draft",
    detail:
      "A learner only reaches a question whose competency is published, so this activity " +
      "stops short of it. Publish the competency, or choose a question that belongs to one " +
      "that is already published.",
  },
  [READINESS_REASONS.DRAFT_MODULE]: {
    headline: "Its learning module is still a draft",
    detail:
      "A learner cannot open anything inside a module that has not been published, whatever " +
      "the activity itself says. Publish the learning module first.",
  },
  [READINESS_REASONS.UNKNOWN]: {
    headline: "Something it depends on is still a draft",
    detail:
      "Its questions are chosen, so what is missing sits behind them: a question, a " +
      "question's competency, or its learning module. Open its questions to see which of " +
      "them is not published yet.",
  },
});

/**
 * Why a published activity is not ready, as specifically as the row allows.
 *
 * An empty activity is the one case the row settles on its own, because it
 * carries `question_count`. Beyond that the boolean says only "not ready", so
 * a `readiness_reason` code is used when the API supplies one and the honest
 * catch-all is used when it does not.
 *
 * @param {object} activity
 * @returns {string} One of `READINESS_REASONS`
 */
function readinessReason(activity) {
  const count = Number(activity.question_count);
  if (!Number.isFinite(count) || count < 1) {
    return READINESS_REASONS.NO_QUESTIONS;
  }

  const named =
    typeof activity.readiness_reason === "string"
      ? activity.readiness_reason.trim().toLowerCase()
      : "";

  return named && REASON_COPY[named] && named !== READINESS_REASONS.UNKNOWN
    ? named
    : READINESS_REASONS.UNKNOWN;
}

/**
 * What a row should say about its setup, beyond whether it was published.
 *
 * Returns `null` when there is nothing to add — including when `is_ready` is
 * absent. An API that has not started sending the field yet must not turn every
 * published activity in the workspace into a warning, so only an explicit
 * `false` counts as unready.
 *
 * Draft and archived rows return `null` too. Neither is in front of a learner,
 * so "not ready" would be noise on a row that is behaving exactly as intended.
 *
 * @param {object|null|undefined} activity - A teacher-admin activity list row
 * @returns {{ reason: string, label: string, headline: string, detail: string }|null}
 */
export function describeActivityReadiness(activity) {
  if (!activity || typeof activity !== "object") {
    return null;
  }

  const status =
    typeof activity.status === "string" ? activity.status.trim().toLowerCase() : "";
  if (status !== "published" || activity.is_ready !== false) {
    return null;
  }

  const reason = readinessReason(activity);
  return { reason, label: "Not ready", ...REASON_COPY[reason] };
}
