import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LinkPending } from "@/modules/shared";

import { QUESTION_RESULTS_ID, questionBankUrl } from "../utils/urls.js";

/**
 * Simple prev/next paging under the list. Links carry every active filter, so
 * paging narrows the same set the caption above describes, and an edge that
 * does not exist renders as text rather than a broken link.
 *
 * They also carry the results fragment. Paging is the one control here that
 * should move the page — asking for the next page means wanting to look at it
 * — and the fragment moves it to the top of the results rather than the top of
 * the workspace, which is where a plain Link would have put it.
 */
export function Pagination({ filters, page, totalPages }) {
  if (totalPages <= 1) {
    return null;
  }

  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      aria-label="Question pages"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      {hasPrevious ? (
        <Button asChild size="sm" variant="outline">
          <Link href={`${questionBankUrl({ ...filters, page: page - 1 })}#${QUESTION_RESULTS_ID}`}>
            <ChevronLeft aria-hidden="true" className="size-4" />
            Earlier
            <LinkPending />
          </Link>
        </Button>
      ) : (
        <span className="text-sm text-muted-foreground">No earlier pages</span>
      )}

      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>

      {hasNext ? (
        <Button asChild size="sm" variant="outline">
          <Link href={`${questionBankUrl({ ...filters, page: page + 1 })}#${QUESTION_RESULTS_ID}`}>
            Later
            <LinkPending />
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      ) : (
        <span className="text-sm text-muted-foreground">No later pages</span>
      )}
    </nav>
  );
}
