import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

function pageQuery(search, page) {
  const query = new URLSearchParams();
  if (search) {
    query.set("search", search);
  }
  query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `/teacher/learning-modules?${suffix}` : "/teacher/learning-modules";
}

/**
 * Simple prev/next paging under the list. Links carry the current search, and
 * an edge that does not exist renders as text rather than a broken link.
 */
export function Pagination({ search, page, totalPages }) {
  if (totalPages <= 1) {
    return null;
  }

  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav aria-label="Module pages" className="flex flex-wrap items-center justify-between gap-3">
      {hasPrevious ? (
        <Button asChild size="sm" variant="outline">
          <Link href={pageQuery(search, page - 1)}>
            <ChevronLeft aria-hidden="true" className="size-4" />
            Earlier
          </Link>
        </Button>
      ) : (
        <span className="text-sm text-muted-foreground">No earlier pages</span>
      )}

      <p aria-live="polite" className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>

      {hasNext ? (
        <Button asChild size="sm" variant="outline">
          <Link href={pageQuery(search, page + 1)}>
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