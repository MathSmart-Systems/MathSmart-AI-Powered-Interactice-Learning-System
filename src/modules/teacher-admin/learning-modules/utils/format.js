/**
 * Small presentational helpers for the module list. No date library is pulled
 * in just for a couple of numbers: the API sends a recognised UTC timestamp
 * and the teacher reads it as a plain calendar date.
 */

const DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Manila",
});

/** "2026-09-13T…" → "13 Sep 2026". Anything unparsable stays as-is. */
export function formatDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return DATE_FORMATTER.format(date);
}

/** A date label for a row's footer: "Updated 13 Sep 2026", or null. */
export function formatUpdated(value) {
  const date = formatDate(value);
  return date ? `Updated ${date}` : null;
}

/**
 * The caption under the list: "Showing 21–40 of 118 published modules".
 *
 * The state is named because the list only ever shows one of them. Both
 * numbers come from the same filtered read, so the caption describes the rows
 * above it rather than the library as a whole.
 */
export function rangeLabel({ page, pageSize, totalItems, statusLabel = null }) {
  const scope = statusLabel ? `${statusLabel.toLowerCase()} modules` : "modules";

  if (!totalItems) {
    return `No ${scope}`;
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return `Showing ${first}–${last} of ${totalItems} ${scope}`;
}
