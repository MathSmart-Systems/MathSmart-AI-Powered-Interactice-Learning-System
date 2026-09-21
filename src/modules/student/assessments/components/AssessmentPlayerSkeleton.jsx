function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse bg-secondary ${className}`} />;
}

/**
 * Sitting an assessment, while the paper is still being fetched.
 *
 * The player showed a centred spinner on a short, otherwise empty page. When
 * the questions arrived the document grew by several screens at once, which is
 * the exact shape of the "it jumped" complaint: the browser had clamped the
 * scroll offset to a page that was barely taller than the viewport.
 *
 * The bleed on the bar (`-mx-5 sm:-mx-8 lg:-mx-12`) cancels the workspace's
 * own padding so it lines up with the real sticky header it stands in for.
 *
 * Shown on the first load only. Once an attempt is open, answering, moving
 * between questions and submitting all keep the content on screen.
 */
export function AssessmentPlayerSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <p role="status" className="sr-only">
        Loading your assessment
      </p>

      <div className="-mx-5 border-b border-border px-5 pt-4 pb-4 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Block className="h-5 w-32" />
          <div className="flex items-center gap-3">
            <Block className="h-6 w-28 rounded-full" />
            <Block className="h-9 w-24" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Block className="h-1.5 w-full rounded-full" />
          <Block className="h-3 w-10 shrink-0" />
        </div>
      </div>

      <div className="border border-border bg-card">
        <div className="flex flex-col gap-3 px-6 pt-6">
          <Block className="h-3 w-40" />
          <Block className="h-6 w-4/5" />
          <Block className="h-6 w-3/5" />
        </div>

        <div className="flex flex-col gap-3 px-6 pt-6 pb-6">
          <Block className="h-14 w-full" />
          <Block className="h-14 w-full" />
          <Block className="h-14 w-full" />
          <Block className="h-14 w-full" />
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <Block className="h-11 w-28" />
        <Block className="h-11 w-40" />
      </div>
    </div>
  );
}
