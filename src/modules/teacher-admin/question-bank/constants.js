/**
 * Authoring vocabulary for the Question Bank.
 *
 * Only the three MVP question types are offered because the data contract
 * refuses to publish the reserved ones (`true_false`, `matching`, `ordering`)
 * until their accessible interaction and grading support is complete. Offering
 * a type that can never leave draft state would just create dead-end records.
 */

export const QUESTION_TYPES = [
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "number_input", label: "Number input" },
  { value: "fill_blank", label: "Fill in the blank" },
];

export const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

export const QUESTION_TYPE_LABELS = Object.freeze(
  Object.fromEntries(QUESTION_TYPES.map((type) => [type.value, type.label])),
);

export const DIFFICULTY_LABELS = Object.freeze(
  Object.fromEntries(DIFFICULTY_OPTIONS.map((option) => [option.value, option.label])),
);

export const STATUS_LABELS = Object.freeze({
  draft: "Draft",
  published: "Published",
  archived: "Archived",
});

export const DEFAULT_PAGE_SIZE = 10;