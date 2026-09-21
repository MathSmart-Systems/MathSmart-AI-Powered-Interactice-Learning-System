/**
 * Keeping the verdicts a learner already established across a resumed attempt.
 *
 * `POST /activities/{id}/attempts` resumes an attempt with the answers saved
 * against it, but a verdict is not one of the things it returns: correctness is
 * decided once, by `POST /answer-checks`, and no later read gives it back. So a
 * learner who closed the tab after checking three questions used to reopen the
 * activity, see their own three answers, and be told nothing about which of
 * them they had already got right.
 *
 * The player therefore remembers the verdicts it was handed, per attempt, and
 * restores only the ones that still belong to the answer they were handed for.
 * That is the entire rule: a stored verdict survives when the resumed answer
 * still matches the answer the server judged, and is dropped otherwise. Nothing
 * here invents a verdict, infers one from an answer, or decides correctness —
 * and none of it reaches scoring, which happens on the server from the answers
 * themselves when the attempt is submitted.
 *
 * Pure functions, so the rule can be tested without a browser. The reading and
 * writing of the store live in the hook that owns the attempt.
 */

/** Where one attempt's remembered verdicts live. Scoped by attempt, never shared. */
export function checksStorageKey(attemptId) {
  return attemptId ? `mathsmart.activity-checks.${attemptId}` : null;
}

/**
 * One answer as a comparison sees it.
 *
 * An answer arrives as a choice key, a typed number or a word, and comes back
 * from the API as whatever JSON held it, so the comparison is made on trimmed
 * text. An empty answer is `null`: there is nothing for a verdict to belong to.
 */
export function normalizeAnswer(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function verdictFrom(entry) {
  return {
    isCorrect: entry.isCorrect === true,
    attemptsForQuestion:
      Number.isFinite(entry.attemptsForQuestion) && entry.attemptsForQuestion > 0
        ? entry.attemptsForQuestion
        : 1,
    feedback: typeof entry.feedback === "string" ? entry.feedback : null,
    hintAvailable: entry.hintAvailable === true,
  };
}

/**
 * The verdicts as they are remembered: each one with the answer it was given
 * for, which is what makes restoring it later safe rather than a guess.
 */
export function toStoredChecks(checks, answers) {
  const stored = {};
  if (!checks || typeof checks !== "object") return stored;

  for (const [questionId, check] of Object.entries(checks)) {
    if (!check || typeof check !== "object") continue;

    const answer = normalizeAnswer(answers?.[questionId]);
    // A verdict whose answer has gone cannot be matched again later, so it is
    // not worth remembering.
    if (answer === null) continue;

    stored[questionId] = { ...verdictFrom(check), answer };
  }

  return stored;
}

/**
 * The verdicts that may be shown again, given the answers the server resumed
 * the attempt with.
 *
 * A stored entry is refused unless it carries a real boolean verdict and its
 * answer still matches the saved one. Anything else — a half-written store, a
 * verdict for an answer the learner has since changed, a question that is no
 * longer in the attempt — is dropped, because showing it would be telling a
 * learner something the server never said.
 */
export function fromStoredChecks(stored, savedAnswers) {
  const restored = {};
  if (!stored || typeof stored !== "object") return restored;

  for (const [questionId, entry] of Object.entries(stored)) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.isCorrect !== "boolean") continue;

    const saved = normalizeAnswer(savedAnswers?.[questionId]);
    if (saved === null || saved !== normalizeAnswer(entry.answer)) continue;

    restored[questionId] = verdictFrom(entry);
  }

  return restored;
}
