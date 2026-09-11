function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse bg-secondary ${className}`} />;
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-4 border border-border bg-card px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <Block className="h-4 w-24" />
        <Block className="h-5 w-16 rounded-full" />
      </div>
      <Block className="h-5 w-4/5" />
      <Block className="h-4 w-full" />
      <Block className="h-4 w-2/3" />
      <div className="mt-2 flex items-center gap-4">
        <Block className="h-4 w-28" />
        <Block className="h-4 w-20" />
      </div>
    </div>
  );
}

/**
 * The competency catalogue while it is still being read.
 *
 * It reserves the same shape the finished page occupies — heading, command bar
 * and a card grid — so nothing jumps when the data arrives, and it announces
 * itself once for screen readers instead of leaving them on a silent page.
 */
export function CompetenciesSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <p role="status" className="sr-only">
        Loading the competency catalogue
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Block className="h-4 w-40" />
          <Block className="h-9 w-56 max-w-full" />
          <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        </div>
        <Block className="h-4 w-4/5 max-w-xl" />
        <div className="mt-1 h-11 w-40" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <Block className="h-10 w-full max-w-xs" />
          <div className="flex gap-2">
            <Block className="h-9 w-20" />
            <Block className="h-9 w-24" />
            <Block className="h-9 w-28" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </div>
  );
}