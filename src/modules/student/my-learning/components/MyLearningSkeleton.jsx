function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse bg-secondary ${className}`} />;
}

function RowSkeleton() {
  return (
    <div className="flex flex-col gap-3 border-t border-border px-5 py-5 first:border-t-0 sm:flex-row sm:items-start sm:gap-6">
      <Block className="h-7 w-7 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Block className="h-4 w-2/3" />
        <Block className="h-3 w-1/3" />
        <Block className="h-3 w-2/5" />
      </div>
      <Block className="h-10 w-28 shrink-0" />
    </div>
  );
}

/**
 * My Learning while it is still being read.
 *
 * It reserves the same shape the finished page occupies, so nothing jumps when
 * the data arrives, and it announces itself once for screen readers instead of
 * leaving them on a silent page.
 */
export function MyLearningSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <p role="status" className="sr-only">
        Loading your lessons
      </p>

      <div className="flex flex-col gap-3">
        <Block className="h-4 w-40" />
        <Block className="h-9 w-56 max-w-full" />
        <Block className="h-4 w-full max-w-lg" />
        <Block className="mt-1 h-0.5 w-16" />
      </div>

      <div className="flex flex-col gap-4">
        <Block className="h-6 w-52" />
        <div className="flex flex-col border border-border bg-card">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Block className="h-6 w-52" />
        <Block className="h-24 w-full border border-border bg-card" />
      </div>
    </div>
  );
}