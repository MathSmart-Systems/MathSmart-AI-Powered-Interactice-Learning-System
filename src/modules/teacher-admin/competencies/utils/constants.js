/**
 * Shared vocabulary for the competency catalogue.
 *
 * The five strands are the DepEd Grade 6 mathematics content areas. The MVP
 * curates Grade 6 competencies first even though the schema stays extensible
 * to other grade levels.
 */

/** The grade the MVP curates content for, used to pre-fill the create form. */
export const MVP_GRADE_NAME = "Grade 6";

/** The DepEd strands a competency can belong to. */
export const COMPETENCY_DOMAINS = Object.freeze([
  "Numbers and Number Sense",
  "Geometry",
  "Patterns and Algebra",
  "Measurement",
  "Statistics and Probability",
]);

/** Which strand happens to be first, so pre-fills never invent one. */
export const DEFAULT_DOMAIN = COMPETENCY_DOMAINS[0];

/**
 * The filter values offered on the working list.
 *
 * `all` is the default because a Teacher/Administrator legitimately reads every
 * publication state; the label is always written out beside its badge.
 */
export const STATUS_FILTERS = Object.freeze([
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
]);