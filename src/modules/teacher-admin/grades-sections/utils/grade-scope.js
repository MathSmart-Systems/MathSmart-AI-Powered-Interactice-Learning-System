/**
 * The MVP curriculum scope, as the directory sees it.
 *
 * MathSmart teaches DepEd Grade 6 mathematics and nothing else, so the
 * workspace manages one grade level and the sections under it. The API refuses
 * anything else; this module is how the interface stops offering it in the
 * first place, and how it accounts for records that predate the rule instead
 * of pretending they are not there.
 *
 * The same rule is stated on the server in `backend/modules/teacher_admin/
 * grade_scope.py`. Keep the two in step.
 */

/** The only grade level MathSmart supports. */
export const MVP_GRADE_LEVEL = 6;

/** The fixed name used when the Grade 6 record has not been read yet. */
export const MVP_GRADE_NAME = `Grade ${MVP_GRADE_LEVEL}`;

/**
 * Numbers in a grade name that could plausibly name a grade level. A year such
 * as 2026 is not one of them, so "Grade 6 (2026)" reads as Grade 6.
 */
const GRADE_LIKE = new Set(Array.from({ length: 12 }, (_, index) => index + 1));

/** Whether this record is the one grade MathSmart teaches. */
export function isMvpGrade(grade) {
  return Number(grade?.level) === MVP_GRADE_LEVEL;
}

/**
 * Whether a grade's name claims a different grade level than its number.
 *
 * A name carrying no grade-like number claims nothing, so it cannot contradict
 * anything. A name carrying one has to agree with the level, which is what
 * stops a record reading "Grade 3" while it is stored as Grade 6.
 */
export function nameContradictsLevel(name, level) {
  if (typeof name !== "string" || !name.trim()) return false;
  if (level === null || level === undefined) return false;

  const claimed = new Set(
    (name.match(/\d+/g) ?? []).map(Number).filter((found) => GRADE_LIKE.has(found)),
  );
  if (claimed.size === 0) return false;
  return claimed.size !== 1 || !claimed.has(Number(level));
}

/**
 * Splits the directory into what this workspace manages and what it does not.
 *
 * Everything the API returns is accounted for. The Grade 6 record and its
 * sections are the working directory; a legacy grade at another level, a
 * duplicate Grade 6, and any section hanging off one of them are set aside so
 * a teacher can retire them rather than lose sight of them.
 *
 * @param {{grades?: Array, sections?: Array}} directory
 */
export function partitionDirectory({ grades, sections } = {}) {
  const allGrades = Array.isArray(grades) ? grades : [];
  const allSections = Array.isArray(sections) ? sections : [];

  const supported = allGrades.filter(isMvpGrade);
  const grade = supported[0] ?? null;

  // A second Grade 6 row is out of scope too: the product has one grade, and
  // leaving a duplicate in the working list would make sections ambiguous.
  const outOfScopeGrades = allGrades.filter((entry) => entry !== grade);

  const inScope = (section) => grade !== null && section?.grade_id === grade.grade_id;

  return {
    grade,
    outOfScopeGrades,
    sections: allSections.filter(inScope),
    outOfScopeSections: allSections.filter((section) => !inScope(section)),
  };
}

/**
 * The display name for a grade a section points at.
 *
 * Falls back to the raw identifier rather than inventing a name, so a section
 * whose grade is missing reads as a problem instead of as Grade 6.
 */
export function gradeNameFor(section, grades) {
  const match = (Array.isArray(grades) ? grades : []).find(
    (grade) => grade.grade_id === section?.grade_id,
  );
  return match?.name ?? section?.grade_id ?? "Unknown grade";
}
