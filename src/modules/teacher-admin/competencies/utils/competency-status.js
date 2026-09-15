/**
 * The words and badge treatments MathSmart uses for competency publication.
 *
 * A status is never carried by its badge alone: the label is always written
 * out, and the badge variant only reinforces it. `outline` is the quietest and
 * belongs to archived work, which is no longer live but is never discarded —
 * learner history points at these rows.
 */

/** `app.publication_status` as a Teacher/Administrator reads it. */
export const PUBLICATION_STATUS = Object.freeze({
  draft: Object.freeze({
    label: "Draft",
    badge: "secondary",
    summary: "Being authored. Learners do not see this yet.",
  }),
  published: Object.freeze({
    label: "Published",
    badge: "default",
    summary: "Live for learners through the curriculum MathSmart serves.",
  }),
  archived: Object.freeze({
    label: "Archived",
    badge: "outline",
    summary: "Retired from the live curriculum but kept for learner history.",
  }),
});

export function publicationStatus(value) {
  return (
    PUBLICATION_STATUS[value] ?? {
      label: "Unknown",
      badge: "outline",
      summary: "This publication state needs attention from a Curriculum Administrator.",
    }
  );
}

/** The two states the create and edit forms may choose between. */
export const FORM_STATUSES = Object.freeze([
  Object.freeze({
    value: "draft",
    label: PUBLICATION_STATUS.draft.label,
    help: PUBLICATION_STATUS.draft.summary,
  }),
  Object.freeze({
    value: "published",
    label: PUBLICATION_STATUS.published.label,
    help: PUBLICATION_STATUS.published.summary,
  }),
]);