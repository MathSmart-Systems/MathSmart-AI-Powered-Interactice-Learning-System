/**
 * Small presentational helpers for the bank's list. No date library is pulled
 * in just for two numbers: the API sends a recognised UTC timestamp and the
 * teacher reads it as a plain calendar date.
 */

const DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
  year: "numeric",
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

/** Range caption like "1–10 of 47 questions" for the footer under the list. */
export function rangeLabel({ page, pageSize, totalItems }) {
  if (totalItems === 0) {
    return "No questions";
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return `${first}–${last} of ${totalItems} questions`;
}