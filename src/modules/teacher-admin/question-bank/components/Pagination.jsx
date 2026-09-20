import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

import { questionBankUrl } from "../utils/urls.js";

/**
 * Simple prev/next paging under the list. Links carry every active filter, so
 * paging narrows the same set the caption above describes, and an edge that
 * does not exist renders as text rather than a broken link.
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
          <Link href={questionBankUrl({ ...filters, page: page - 1 })}>
            <ChevronLeft aria-hidden="true" className="size-4" />
            Earlier
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
          <Link href={questionBankUrl({ ...filters, page: page + 1 })}>
            Later
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      ) : (
        <span className="text-sm text-muted-foreground">No later pages</span>
      )}
    </nav>
  );
}
