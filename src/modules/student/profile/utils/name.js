/**
 * What a learner may call themselves.
 *
 * The same bounds the API enforces (`OwnProfileChanges`, 2–120 characters
 * after trimming), stated here so the form can refuse without a round trip.
 * The API checks again; this is the courtesy, not the boundary.
 */

export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 120;

/**
 * What is wrong with this name, or null when nothing is.
 *
 * Measured on the trimmed value, so a name of spaces is refused rather than
 * saved as an invisible one.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function nameRejectionReason(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length < MIN_NAME_LENGTH || trimmed.length > MAX_NAME_LENGTH) {
    return `Your name needs between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters.`;
  }
  return null;
}
