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
 * Which learners a roster read is about.
 *
 * Sent to the API rather than applied here, so the page, the total and the
 * per-section counts are one question asked once. Filtering the loaded page
 * would make a roster of 412 report whatever the first hundred happened to
 * contain.
 */
export const ROSTER_STATUS = Object.freeze({
  ENROLLED: "enrolled",
  DROPPED: "dropped",
  ALL: "all",
});

export const ROSTER_STATUS_OPTIONS = Object.freeze([
  Object.freeze({ value: ROSTER_STATUS.ENROLLED, label: "Enrolled" }),
  Object.freeze({ value: ROSTER_STATUS.DROPPED, label: "Dropped" }),
  Object.freeze({ value: ROSTER_STATUS.ALL, label: "All students" }),
]);

/** A status the API will accept, falling back to the default rather than guessing. */
export function rosterStatus(value) {
  return ROSTER_STATUS_OPTIONS.some((option) => option.value === value)
    ? value
    : ROSTER_STATUS.ENROLLED;
}

/**
 * What a section heading says about its size.
 *
 * Reads back the status the roster is being viewed under, because "38" means
 * something different in each: enrolled learners, dropped ones, or both. The
 * "shown" clause appears only when the page is holding fewer than the section
 * has, so an untruncated section says one plain number.
 */
export function sectionCountLabel({ status, enrolled = 0, dropped = 0, shown = 0 }) {
  if (status === ROSTER_STATUS.DROPPED) {
    return `${dropped} dropped`;
  }

  const base =
    status === ROSTER_STATUS.ALL
      ? `${enrolled} enrolled · ${dropped} dropped`
      : `${enrolled} enrolled`;

  const total = status === ROSTER_STATUS.ALL ? enrolled + dropped : enrolled;
  return total > shown ? `${base}, ${shown} shown` : base;
}

/** The heading for learners who are in no section this roster recognises. */
export const UNPLACED_GROUP_NAME = "Needs section assignment";

/**
 * The roster split into the classes it is made of.
 *
 * Class section is the unit a teacher works in — they clear a section at the
 * end of the year, not a school — so the roster is grouped by it rather than
 * filtered down to one at a time.
 *
 * Headings come only from the sections passed in, which are the active ones of
 * the canonical Grade 6 record. A learner's own `section_name` is never used
 * to invent a heading: a legacy section from an earlier deployment would
 * otherwise appear on this roster simply because one row still points at it.
 * Such a learner is not dropped from the list — losing them would be worse
 * than showing them — but is grouped under a heading that names the problem.
 *
 * @param {Array} learners - The loaded page of the roster
 * @param {Array} sections - The active sections of the canonical Grade 6 record
 * @returns {Array<{sectionId: string|null, name: string, learners: Array}>}
 */
export function groupBySection(learners, sections) {
  const rows = Array.isArray(learners) ? learners : [];
  const groups = new Map();

  for (const section of Array.isArray(sections) ? sections : []) {
    groups.set(section.section_id, { sectionId: section.section_id, name: section.name, learners: [] });
  }

  const unassigned = { sectionId: null, name: UNPLACED_GROUP_NAME, learners: [] };

  for (const learner of rows) {
    const group = learner.section_id ? groups.get(learner.section_id) : null;
    if (group) group.learners.push(learner);
    else unassigned.learners.push(learner);
  }

  const ordered = [...groups.values()].filter((group) => group.learners.length > 0);
  if (unassigned.learners.length > 0) ordered.push(unassigned);
  return ordered;
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
