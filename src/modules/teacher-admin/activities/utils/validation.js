/**
 * Client-side validation for activity authoring.
 *
 * These mirror the constraints in `backend/modules/teacher_admin/admin_schemas.py`
 * and the database CHECK constraints in `app.activities`.
 */

export const MAX_TITLE_LENGTH = 300;
export const MIN_TITLE_LENGTH = 2;
export const MAX_DURATION_MINUTES = 600;
export const MIN_DURATION_MINUTES = 1;
export const MIN_POINTS = 0;
export const MIN_MASTERY_THRESHOLD = 1;
export const MAX_MASTERY_THRESHOLD = 100;
export const DEFAULT_MASTERY_THRESHOLD = 75;
export const MAX_DESCRIPTION_LENGTH = 4000;

export const VALID_STATUSES = new Set(["draft", "published", "archived"]);

/**
 * Validates activity draft form values.
 *
 * @param {object} draft
 * @param {string} [draft.title]
 * @param {string} [draft.module_id]
 * @param {number|string} [draft.estimated_minutes]
 * @param {number|string} [draft.points]
 * @param {number|string} [draft.mastery_threshold]
 * @param {string} [draft.description]
 * @param {string} [draft.status]
 * @returns {{ isValid: boolean, errors: Record<string, string> }}
 */
export function validateActivityDraft(draft = {}) {
  const errors = {};

  const title = typeof draft.title === "string" ? draft.title.trim() : "";
  if (!title) {
    errors.title = "Give the activity a title.";
  } else if (title.length < MIN_TITLE_LENGTH) {
    errors.title = `Use at least ${MIN_TITLE_LENGTH} characters.`;
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Use at most ${MAX_TITLE_LENGTH} characters.`;
  }

  const moduleId = typeof draft.module_id === "string" ? draft.module_id.trim() : "";
  if (!moduleId) {
    errors.module_id = "Choose the learning module this activity belongs to.";
  }

  const minutes = Number(draft.estimated_minutes);
  if (
    draft.estimated_minutes === undefined ||
    draft.estimated_minutes === null ||
    draft.estimated_minutes === "" ||
    !Number.isInteger(minutes) ||
    minutes < MIN_DURATION_MINUTES ||
    minutes > MAX_DURATION_MINUTES
  ) {
    errors.estimated_minutes = `Estimate between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES} minutes.`;
  }

  const points = Number(draft.points);
  if (
    draft.points !== undefined &&
    draft.points !== null &&
    draft.points !== "" &&
    (!Number.isInteger(points) || points < MIN_POINTS)
  ) {
    errors.points = `Points must be a positive number or zero.`;
  }

  const threshold = Number(draft.mastery_threshold);
  if (
    draft.mastery_threshold !== undefined &&
    draft.mastery_threshold !== null &&
    draft.mastery_threshold !== "" &&
    (!Number.isInteger(threshold) ||
      threshold < MIN_MASTERY_THRESHOLD ||
      threshold > MAX_MASTERY_THRESHOLD)
  ) {
    errors.mastery_threshold = `Mastery threshold must be a percentage between ${MIN_MASTERY_THRESHOLD}% and ${MAX_MASTERY_THRESHOLD}%.`;
  }

  if (typeof draft.description === "string" && draft.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`;
  }

  if (draft.status && !VALID_STATUSES.has(draft.status)) {
    errors.status = "Choose a valid status (draft, published, or archived).";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
