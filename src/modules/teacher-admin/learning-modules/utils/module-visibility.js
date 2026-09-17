/**
 * Learner visibility of a module, as the authoring screens must explain it.
 *
 * The database lets a learner open a module only when both the module and its
 * competency are published. These helpers turn that rule into the warning an
 * author sees, so publishing can never silently leave a module where learners
 * can't reach it. An unknown competency status produces no warning: when the
 * competency read degraded, the row falls back to silence rather than a guess.
 */

const NON_PUBLISHED_WORDS = Object.freeze({
  draft: "a draft",
  archived: "archived",
});

/**
 * The author-facing warning for a module learners cannot open, or null when no
 * warning applies.
 */
export function moduleVisibilityWarning({ moduleStatus, competencyStatus }) {
  if (moduleStatus !== "published" || competencyStatus === "published") {
    return null;
  }

  const word = NON_PUBLISHED_WORDS[competencyStatus];
  if (!word) {
    return null;
  }

  return `Learners can't open this yet — its competency is ${word}. Publish the competency first.`;
}