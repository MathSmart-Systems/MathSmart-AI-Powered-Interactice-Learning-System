/**
 * What the roster knows about itself.
 *
 * MathSmart teaches one grade, so enrollment never asks which. The roster reads
 * at most one page, so it has to say plainly when there are more learners than
 * it is showing — using the count the API reported, never the length of the
 * page it happened to receive.
 */

/** The only grade level MathSmart supports. */
export const MVP_GRADE_LEVEL = 6;

/** The fixed name used before the grade record has been read. */
export const MVP_GRADE_NAME = `Grade ${MVP_GRADE_LEVEL}`;

/**
 * The Grade 6 record from the grade directory, or null when it is missing.
 *
 * A directory that still holds legacy grades answers with the one that
 * matters; a deployment missing the seeded record answers with nothing, and
 * the caller has to say so rather than enroll a learner into a guess.
 */
export function mvpGrade(grades) {
  if (!Array.isArray(grades)) return null;
  return grades.find((grade) => Number(grade?.level) === MVP_GRADE_LEVEL) ?? null;
}

/**
 * The sections a learner may actually be placed in.
 *
 * Only sections belonging to the Grade 6 record, and only ones still active: a
 * retired section is not somewhere a learner can be enrolled, and the API
 * refuses it. Sorted by name so the list reads the same on every render.
 */
export function assignableSections(sections, grade) {
  if (!Array.isArray(sections) || !grade) return [];
  return sections
    .filter((section) => section.grade_id === grade.grade_id && section.is_active !== false)
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

/**
 * The sentence shown when the roster holds more learners than it loaded.
 *
 * Returns null when nothing is being hidden, so the caller renders nothing
 * rather than a line that says everything is fine.
 *
 * @param {number} shown - How many learners are on screen
 * @param {number} total - How many the API says exist
 * @returns {string|null}
 */
export function rosterTruncationMessage(shown, total) {
  const loaded = Number.isFinite(shown) ? shown : 0;
  const all = Number.isFinite(total) ? total : 0;
  if (all <= loaded) return null;

  return `Showing first ${loaded} of ${all} learners. Filter by section to narrow the list.`;
}

/**
 * A learner's display name, or a plain stand-in.
 *
 * Never an empty string, because the name is the link to their record and a
 * link with no text cannot be reached by keyboard or read aloud.
 */
export function learnerName(learner) {
  const name = typeof learner?.full_name === "string" ? learner.full_name.trim() : "";
  return name || "Unnamed learner";
}
