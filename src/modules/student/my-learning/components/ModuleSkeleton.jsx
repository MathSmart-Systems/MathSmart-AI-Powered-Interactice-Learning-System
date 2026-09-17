function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse bg-secondary ${className}`} />;
}

/**
 * A lesson while it is still being read.
 *
 * It reserves the same shape the finished lesson occupies — back link, header,
 * hero, then content blocks — so nothing jumps when the data arrives.
 */
export function ModuleSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <p role="status" className="sr-only">
        Loading your lesson
      </p>

      <Block className="h-4 w-32" />
      <Block className="h-4 w-40" />

      <div className="flex flex-col gap-3">
        <Block className="h-14 w-full max-w-xl" />
        <Block className="h-3 w-48" />
        <Block className="mt-1 h-0.5 w-16" />
      </div>

      <div className="flex flex-col gap-4 border border-border bg-card px-5 py-6">
        <Block className="h-6 w-40" />
        <div className="flex flex-col gap-2">
          <Block className="h-3 w-full" />
          <Block className="h-3 w-3/4" />
        </div>
        <div className="flex flex-col gap-2">
          <Block className="h-4 w-2/3" />
          <Block className="h-4 w-1/2" />
          <Block className="h-4 w-3/5" />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Block className="h-6 w-52" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Block className="h-32 w-full border border-border bg-card" />
          <Block className="h-32 w-full border border-border bg-card" />
        </div>
      </div>
    </div>
  );
}