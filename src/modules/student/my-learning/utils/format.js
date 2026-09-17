/**
 * Presentation formatting for Student My Learning.
 *
 * Nothing here decides a result. Completion percentages, statuses and progress
 * come from the backend; these functions only choose the words and digits a
 * Grade 6 learner reads. Keeping them pure and separate is what lets them be
 * tested without a request.
 */

/** A finite number, or `null` for anything the API left unanswered. */
export function toNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Whole minutes as words, for an estimate a learner can plan around. */
export function formatMinutes(value) {
  const minutes = toNumber(value);

  if (minutes === null || minutes <= 0) {
    return null;
  }

  const whole = Math.round(minutes);
  return `About ${whole} ${whole === 1 ? "minute" : "minutes"}`;
}

/** Completion as a whole percentage in [0, 100], or `null` when unanswered. */
export function formatPercent(value) {
  const percent = toNumber(value);
  if (percent === null) {
    return null;
  }
  return Math.min(Math.max(Math.round(percent), 0), 100);
}

/**
 * How a learner's place in a module reads as a sentence.
 *
 * The completion percentage is the backend's number; the words around it are
 * ours. A module that has not been started has no number at all, because "0%"
 * would pretend a value that was never given.
 */
export function completionSentence({ percent, isComplete }) {
  if (isComplete) {
    return "You have finished this lesson.";
  }

  if (percent === null || percent === 0) {
    return "You have not started this lesson yet.";
  }

  return `${percent}% of this lesson is complete.`;
}

/** Shortest honest words for a row: "Finished", "Not started", "42% done". */
export function progressLabel({ percent, isComplete }) {
  if (isComplete) {
    return "Finished";
  }
  if (percent === null || percent === 0) {
    return "Not started";
  }
  return `${percent}% done`;
}