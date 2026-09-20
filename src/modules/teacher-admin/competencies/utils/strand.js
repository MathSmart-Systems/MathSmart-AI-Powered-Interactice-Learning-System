/**
 * Choosing a content strand, including one that is not on the list.
 *
 * The five DepEd strands cover the Grade 6 curriculum as written. "Other" is
 * the sixth and last option, for a competency that genuinely sits outside
 * them.
 *
 * The option list is fixed and never grows. A strand written under "Other"
 * belongs to that one competency and nothing else: it is stored on its row,
 * shown on its card, and prefilled when it is edited — but it does not become
 * a choice the next competency can pick. A list that learned from what people
 * typed would carry every typo forever, and the DepEd strands would slowly
 * stop being the curriculum.
 *
 * Kept out of the dialog so it can be tested. The form is a client component
 * and its action is a `"use server"` module; neither can be imported by a unit
 * test, and the last defect in this form shipped for exactly that reason.
 */

import { COMPETENCY_DOMAINS, DEFAULT_DOMAIN } from "./constants.js";

/**
 * The option value that means "none of these".
 *
 * Deliberately not a strand anybody could type: it never reaches the API,
 * because the select drops its name the moment this is chosen and the text
 * field carries `domain` instead.
 */
export const OTHER_STRAND = "__other__";

/** The longest strand the API stores, mirrored from `max_length=120`. */
export const STRAND_MAX = 120;

/**
 * Every option the strand list offers, in order — the five DepEd strands, then
 * "Other".
 *
 * A constant, not a function of the catalogue. Nothing a Teacher/Administrator
 * types can add to it, so the list reads the same on every competency and on
 * every day.
 */
export const STRAND_OPTIONS = Object.freeze([
  ...COMPETENCY_DOMAINS.map((domain) => Object.freeze({ value: domain, label: domain })),
  Object.freeze({ value: OTHER_STRAND, label: "Other" }),
]);

/**
 * Where the strand control starts, for a new competency or an existing one.
 *
 * A stored strand that is not one of the five selects "Other" and fills the
 * field with it, so editing a competency to fix its code leaves its strand
 * alone. It used to fall back to the first strand instead, which meant saving
 * quietly reassigned it to Numbers and Number Sense.
 *
 * @param {unknown} domain the competency's stored strand, if it has one
 * @returns {{selection: string, custom: string}}
 */
export function initialStrand(domain) {
  const value = typeof domain === "string" ? domain.trim() : "";

  if (!value) {
    return { selection: DEFAULT_DOMAIN, custom: "" };
  }
  if (COMPETENCY_DOMAINS.includes(value)) {
    return { selection: value, custom: "" };
  }
  return { selection: OTHER_STRAND, custom: value.slice(0, STRAND_MAX) };
}
