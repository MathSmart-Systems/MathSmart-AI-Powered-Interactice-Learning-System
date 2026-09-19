import { Card, CardContent } from "@/components/ui/card";

function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-secondary ${className}`} />;
}

/** One placeholder row, the same height as a real directory row. */
function RowSkeleton() {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-2.5 @md:flex-row @md:items-center @md:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Block className="h-4 w-32 max-w-full" />
        <Block className="h-3 w-20 max-w-full" />
      </div>
      <div className="flex w-full shrink-0 items-center gap-2 @sm:w-auto">
        <Block className="h-5 w-14 rounded-full" />
        <Block className="h-8 flex-1 @sm:w-16 @sm:flex-none" />
        <Block className="h-8 flex-1 @sm:w-24 @sm:flex-none" />
      </div>
    </li>
  );
}

/** One placeholder panel, matching the Sections card. */
function PanelSkeleton({ rows }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Block className="h-5 w-32" />
          <Block className="h-8 w-28" />
        </div>
        <ul className="@container space-y-2">
          {Array.from({ length: rows }, (_, index) => (
            <RowSkeleton key={index} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * The class sections while they are still being read.
 *
 * It reserves the same shape the finished page occupies — heading, then the
 * list panel — so nothing jumps when the sections arrive, and it announces
 * itself once for screen readers instead of leaving them on a silent page.
 */
export function GradesSectionsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <p role="status" className="sr-only">
        Loading the class sections
      </p>

      <header className="flex flex-col gap-3">
        <Block className="h-6 w-24 rounded-full" />
        <Block className="h-9 w-56 max-w-full" />
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        <Block className="h-4 w-full max-w-prose" />
      </header>

      <PanelSkeleton rows={3} />
    </div>
  );
}
