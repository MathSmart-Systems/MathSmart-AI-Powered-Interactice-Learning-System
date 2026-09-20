"use client";

import { useEffect, useState } from "react";

/**
 * Says out loud what a filtered list is now showing.
 *
 * A live region only announces a change to its own contents. A region that
 * arrives already holding its text has not changed, so it says nothing — and
 * that is the state every one of these lists was in: the caption under the
 * list carried `aria-live`, but searching, filtering and paging are full
 * navigations here, so the region was rebuilt with its text rather than
 * updated, and a screen-reader user was never told the result set had moved.
 *
 * This renders empty on the first paint and fills in afterwards, which is a
 * change the region can announce. It is deliberately separate from the visible
 * caption: the caption is ordinary text that should not be re-read whenever it
 * is repainted, and this is the announcement.
 *
 * @param {object} props
 * @param {string} props.message - The sentence to announce, e.g. "Showing 21-40 of 118 questions".
 */
export function ResultAnnouncer({ message }) {
  const [announced, setAnnounced] = useState("");

  useEffect(() => {
    // A frame's delay, so the empty region is in the accessibility tree before
    // its text lands. Setting both in the same commit is the case that is not
    // announced, and setting it synchronously here would be the same commit.
    const timer = setTimeout(() => setAnnounced(message ?? ""), 120);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <p aria-live="polite" aria-atomic="true" className="sr-only">
      {announced}
    </p>
  );
}
