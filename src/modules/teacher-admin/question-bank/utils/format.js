/**
 * Small presentational helpers for the bank's list. No date library is pulled
 * in just for two numbers: the API sends a recognised UTC timestamp and the
 * teacher reads it as a plain calendar date.
 *
 * The timezone is pinned to Asia/Manila for the same reason the module list
 * pins it. Left to the runtime, a server render and a browser render of the
 * same row could disagree about which calendar day a late-evening edit fell
 * on, and the two screens a teacher moves between would disagree with each
 * other.
 */

const DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Manila",
});

/** "2026-09-13T…" → "Sep 13, 2026". Anything unparsable stays as-is. */
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

/** A date label for a row's footer: "Updated Sep 13, 2026", or null. */
export function formatUpdated(value) {
  const date = formatDate(value);
  return date ? `Updated ${date}` : null;
}

/**
 * The caption under the list: "Showing 21–40 of 118 questions".
 *
 * Both numbers describe the same filtered set the rows come from, because the
 * filtering happens in the statement rather than over the returned page. A
 * caption counting every status while the list shows one of them was the bug
 * this wording replaces.
 */
export function rangeLabel({ page, pageSize, totalItems, statusLabel = null }) {
  const scope = statusLabel ? `${statusLabel.toLowerCase()} questions` : "questions";

  if (!totalItems) {
    return `No ${scope}`;
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return `Showing ${first}–${last} of ${totalItems} ${scope}`;
}
