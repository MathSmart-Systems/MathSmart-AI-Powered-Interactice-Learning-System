/**
 * What still stands between a draft module and its learners.
 *
 * Publishing used to be reachable only through the author dialog's status
 * field, where the same conditions are checked as form validation. A module
 * that is already finished should not have to be reopened and re-saved to go
 * live, so the list row offers Publish directly — and the conditions have to
 * travel with it, or the row would offer an action the server was always going
 * to refuse.
 *
 * The wording matches the dialog's field errors deliberately. A teacher who
 * meets the same refusal in two places should not have to work out that it is
 * the same refusal.
 */

/** Whether a rule carries both the parts a learner needs. */
function isCompleteRule(rule) {
  return Boolean(rule?.title) && Boolean(rule?.explanation);
}

/** Whether a worked example carries both the parts a learner needs. */
function isCompleteExample(example) {
  return Boolean(example?.problem) && Boolean(example?.solution);
}

/**
 * The reasons a module cannot be published yet, in the order they are worth
 * fixing. An empty array means nothing stands in the way.
 *
 * An unknown competency status produces no reason: the competency read can
 * degrade, and guessing "not published" would hide a legitimate Publish behind
 * a refusal nobody could act on. The API enforces that rule itself and says so
 * in its own words.
 *
 * @param {object} module
 * @param {Array<object>} [module.rules]
 * @param {Array<object>} [module.workedExamples]
 * @param {string|null} [module.competencyStatus]
 * @returns {string[]}
 */
export function modulePublishBlockers({ rules = [], workedExamples = [], competencyStatus } = {}) {
  const blockers = [];

  if (!rules.some(isCompleteRule)) {
    blockers.push("Add at least one core rule with a title and an explanation.");
  }

  if (!workedExamples.some(isCompleteExample)) {
    blockers.push("Add at least one worked example with a problem and a solution.");
  }

  if (competencyStatus && competencyStatus !== "published") {
    blockers.push("Publish this module's competency first.");
  }

  return blockers;
}
