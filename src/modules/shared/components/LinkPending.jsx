"use client";

import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";

/**
 * A spinner on the link that is currently navigating.
 *
 * Rendered as a child of a `<Link>`, which is what `useLinkStatus` reports on:
 * it is pending for the link that was actually followed and for no other. That
 * is the whole point — the feedback belongs on the control the teacher
 * pressed, not on the page.
 *
 * It exists because the alternative was worse. These lists used to replace
 * themselves with a full-page skeleton whenever a tab, a filter or a page link
 * was followed, so the rows a teacher was reading disappeared for the length of
 * a round trip and came back rearranged. Keeping the results on screen is the
 * right behaviour; this is what stops that from looking like nothing happened.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();

  if (!pending) {
    return null;
  }

  return (
    <>
      <LoaderCircle
        aria-hidden="true"
        className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none"
      />
      <span className="sr-only">Loading</span>
    </>
  );
}
