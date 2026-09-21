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
 * How much of a lesson a learner has read, in words about reading.
 *
 * This used to be `completionSentence`, and it said "42% of this lesson is
 * complete". Since completion became a passed activity rather than a read page,
 * that sentence claimed something the database no longer agrees with: a learner
 * who had read every word of a lesson they had not yet practised was told the
 * lesson was 100% complete and then found the next one still shut.
 *
 * The number is still the backend's; only the noun changed. Reading is reported
 * as reading, and the reader says separately what finishes the lesson. A lesson
 * never opened still has no number at all, because "0% read" would pretend a
 * value nobody recorded.
 */
export function readingLabel(percent) {
  if (percent === null || percent === undefined || percent === 0) {
    return "Not read yet";
  }
  if (percent >= 100) {
    return "All read";
  }
  return `${percent}% read`;
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