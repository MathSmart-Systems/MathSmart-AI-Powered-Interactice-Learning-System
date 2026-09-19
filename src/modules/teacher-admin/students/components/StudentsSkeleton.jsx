import { Card, CardContent } from "@/components/ui/card";

function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-secondary ${className}`} />;
}

/** One placeholder row, the height of a real roster row. */
function RowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Block className="h-4 w-40 max-w-full" />
        <Block className="h-3 w-24 max-w-full" />
      </div>
      <div className="hidden items-center gap-3 sm:flex">
        <Block className="h-5 w-20 rounded-full" />
        <Block className="h-5 w-24 rounded-full" />
      </div>
      <Block className="h-8 w-8 shrink-0" />
    </div>
  );
}

/**
 * The student roster while it is still being read.
 *
 * It reserves the shape the finished page occupies — heading, filter bar, then
 * the table — so nothing jumps when the learners arrive, and it announces
 * itself once for screen readers instead of leaving them on a silent page.
 */
export function StudentsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <p role="status" className="sr-only">
        Loading the student roster
      </p>

      <header className="flex flex-col gap-3">
        <Block className="h-6 w-24 rounded-full" />
        <Block className="h-9 w-64 max-w-full" />
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        <Block className="h-4 w-full max-w-prose" />
      </header>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Block className="h-9 w-full sm:max-w-xs" />
            <Block className="h-9 w-full sm:max-w-[12rem]" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 pb-3">
            <Block className="h-4 w-28" />
            <Block className="h-8 w-32" />
          </div>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </CardContent>
      </Card>
    </div>
  );
}
