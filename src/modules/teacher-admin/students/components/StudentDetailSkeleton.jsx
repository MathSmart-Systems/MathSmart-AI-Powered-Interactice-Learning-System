import { Card, CardContent } from "@/components/ui/card";

function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-secondary ${className}`} />;
}

/** One placeholder competency row. */
function CompetencySkeleton() {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-2.5 @md:flex-row @md:items-center @md:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Block className="h-4 w-48 max-w-full" />
        <Block className="h-3 w-28 max-w-full" />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Block className="h-5 w-16 rounded-full" />
        <Block className="h-5 w-16 rounded-full" />
      </div>
    </li>
  );
}

/**
 * One learner's record while it is still being read.
 *
 * Reserves the same shape the finished page occupies — the back link, the
 * identity header, the enrollment facts, then the competency list — so nothing
 * moves when the record arrives. The advisory panel has no placeholder on
 * purpose: it is optional, it loads after the deterministic evidence, and
 * holding space for something that may never come would be a promise.
 */
export function StudentDetailSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <p role="status" className="sr-only">
        Loading the learner record
      </p>

      <Block className="h-4 w-36" />

      <header className="flex flex-col gap-3">
        <Block className="h-6 w-20 rounded-full" />
        <Block className="h-9 w-72 max-w-full" />
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        <Block className="h-4 w-52 max-w-full" />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <CardContent className="flex flex-col gap-2">
              <Block className="h-3 w-24" />
              <Block className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Block className="h-5 w-40" />
          <ul className="@container space-y-2">
            <CompetencySkeleton />
            <CompetencySkeleton />
            <CompetencySkeleton />
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
