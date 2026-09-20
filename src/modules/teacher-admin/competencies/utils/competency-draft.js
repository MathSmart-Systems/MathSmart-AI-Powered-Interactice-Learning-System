/**
 * What the competency form submits, and what it refuses to submit.
 *
 * Kept out of the server action deliberately. An action is a `"use server"`
 * module that reaches `next/cache`, so it cannot be imported by a unit test —
 * and the one bug this file exists to prevent was exactly that: the form
 * stopped collecting a grade, the API stopped accepting one, and the action
 * went on demanding one, so every save failed with "Grade is required" and
 * nothing in the suite could see it.
 *
 * The API is still the boundary. These are the fast, obvious refusals a person
 * gets before a round trip; length, format and uniqueness belong to the server.
 */

/** The fields a competency cannot be saved without, in the order they are asked for. */
export const REQUIRED_FIELDS = Object.freeze([
  Object.freeze({ name: "code", label: "Code" }),
  Object.freeze({ name: "name", label: "Name" }),
  Object.freeze({ name: "domain", label: "Content strand" }),
]);

/**
 * The payload the API expects, built from what the form actually carries.
 *
 * There is no `grade_id`. MathSmart teaches one grade and the server resolves
 * it, so the request may not name one — `extra="forbid"` on the schema refuses
 * it outright — and the form does not ask.
 *
 * @param {{get: (name: string) => unknown}} formData
 */
export function draftFromForm(formData) {
  const read = (field) => String(formData.get(field) ?? "").trim();

  return {
    code: read("code"),
    name: read("name"),
    domain: read("domain"),
    description: read("description") || null,
    status: read("status") || "draft",
  };
}

/**
 * The first required field left blank, or null when the draft can be sent.
 *
 * Named by the label the form uses, so the message points at something the
 * person can actually see on screen.
 *
 * @returns {string|null}
 */
export function missingFieldLabel(draft) {
  for (const field of REQUIRED_FIELDS) {
    const value = draft?.[field.name];
    if (typeof value !== "string" || !value.trim()) {
      return field.label;
    }
  }
  return null;
}
