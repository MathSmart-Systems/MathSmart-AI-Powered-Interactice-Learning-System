/**
 * The advisory summary a learner has already been given, kept.
 *
 * Asking Groq again on every page load meant the wording of a finished
 * assessment changed each time a learner opened it: the same score, the same
 * competencies, different advice. That reads as though the result itself is
 * unstable, which is the opposite of what an advisory note beside a
 * deterministic score should feel like. It also spent a paid request to say
 * the same thing.
 *
 * So the first answer is kept and reused. The key is the attempt, because that
 * is what the advice is about — a retake is a different attempt and earns its
 * own summary.
 *
 * This is the browser's own storage, not the database. Groq output is advisory
 * and the documented boundary keeps it out of the learner record, so this
 * holds it exactly where a convenience belongs: on the device that asked for
 * it. A learner opening the report on another device gets a fresh summary,
 * which is correct rather than a shortcoming.
 */

/** Bumped when the stored shape changes, so old entries are simply ignored. */
const VERSION = "v1";

const PREFIX = `mathsmart:assessment-insight:${VERSION}:`;

/**
 * Storage, when the browser has it and is willing.
 *
 * Private windows, blocked site data and thumbnailing all make this throw
 * rather than return null, and none of those is a reason to lose the report.
 */
function storage() {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The summary already written for this attempt, or nothing.
 *
 * @param {string|null|undefined} attemptId
 * @returns {{feedback_text: string}|null}
 */
export function readInsight(attemptId) {
  if (!attemptId) return null;

  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(`${PREFIX}${attemptId}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    // Anything without the text is not worth showing, and an entry written by
    // an older build may not have it.
    return typeof parsed?.feedback_text === "string" && parsed.feedback_text
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * Keeps the summary for next time. Failure is silent and harmless: the learner
 * still sees this one, and the next visit simply asks again.
 *
 * @param {string|null|undefined} attemptId
 * @param {object|null} feedback
 */
export function writeInsight(attemptId, feedback) {
  if (!attemptId || !feedback?.feedback_text) return;

  const store = storage();
  if (!store) return;

  try {
    store.setItem(
      `${PREFIX}${attemptId}`,
      JSON.stringify({
        feedback_text: feedback.feedback_text,
        provider: feedback.provider ?? null,
        model: feedback.model ?? null,
        generated_at: feedback.generated_at ?? null,
      }),
    );
  } catch {
    // Quota, private mode, blocked storage. None of them is worth a message.
  }
}
