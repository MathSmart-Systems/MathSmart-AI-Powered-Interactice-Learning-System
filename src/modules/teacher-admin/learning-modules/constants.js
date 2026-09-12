/**
 * Authoring vocabulary for the Learning Modules feature.
 *
 * The module lifecycle mirrors the rest of the curriculum: a module is born a
 * draft, is published when it is ready for the learner path, and is archived
 * (never deleted) once it should no longer be given out. The two statuses an
 * author may pick from a form are draft and published; archived only ever
 * happens from the row's archive action.
 */

export const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

export const STATUS_LABELS = Object.freeze({
  draft: "Draft",
  published: "Published",
  archived: "Archived",
});

export const DEFAULT_PAGE_SIZE = 10;

/** The bounded study-time range the API accepts, in minutes. */
export const MIN_ESTIMATED_MINUTES = 1;
export const MAX_ESTIMATED_MINUTES = 600;