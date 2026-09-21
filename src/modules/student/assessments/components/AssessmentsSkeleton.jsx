function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse bg-secondary ${className}`} />;
}

/** One card's worth of space in the "Set for you" grid. */
function CardSkeleton() {
  return (
    <div className="flex h-full flex-col border border-border bg-card">
      <div className="flex flex-col gap-3 px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <Block className="size-10 shrink-0 rounded-md" />
          <Block className="h-6 w-24 shrink-0 rounded-full" />
        </div>
        <Block className="h-5 w-4/5" />
        <Block className="h-3 w-full" />
      </div>

      <div className="px-5 pt-3">
        <Block className="h-3 w-3/5" />
      </div>

      <div className="mt-4 border-t border-border/60 px-5 pt-3 pb-4">
        <Block className="h-8 w-28" />
      </div>
    </div>
  );
}

/** One row's worth of space in the attempt history. */
function HistoryRowSkeleton() {
  return (
    <div className="flex flex-col gap-3 border-t border-border p-5 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Block className="h-4 w-2/5" />
        <Block className="h-3 w-1/4" />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Block className="h-6 w-20 rounded-full" />
        <Block className="h-8 w-28" />
      </div>
    </div>
  );
}

/**
 * The assessments hub while it is still being read.
 *
 * It used to be a single line of text, which reserved none of the space the
 * finished page occupies: the header, two card columns and the history list
 * all arrived at once and shoved the page down under whoever was reading it.
 * This holds the same shape, so the only thing that changes when the data
 * lands is the content of the boxes.
 *
 * Both reads behind this screen are server-side, so this is shown once, on the
 * first load. Nothing a learner does afterwards brings it back.
 */
export function AssessmentsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <p role="status" className="sr-only">
        Loading your assessments
      </p>

      <div className="flex flex-col gap-2">
        <Block className="h-4 w-40" />
        <Block className="h-9 w-64 max-w-full" />
        <Block className="h-4 w-full max-w-lg" />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Block className="h-6 w-32" />
          <Block className="h-3 w-full max-w-md" />
        </div>
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Block className="h-6 w-56" />
          <Block className="h-3 w-full max-w-sm" />
        </div>
        <div className="border border-border bg-card">
          <HistoryRowSkeleton />
          <HistoryRowSkeleton />
        </div>
      </div>
    </div>
  );
}
