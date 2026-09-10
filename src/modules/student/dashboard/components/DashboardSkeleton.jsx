function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse bg-secondary ${className}`} />;
}

function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Block className="h-6 w-52" />
      <div className="flex flex-col gap-4 border border-border bg-card px-5 py-5">
        <Block className="h-4 w-full" />
        <Block className="h-4 w-4/5" />
        <Block className="h-4 w-2/3" />
      </div>
    </div>
  );
}

/**
 * The dashboard while it is still being read.
 *
 * It reserves the same shape the finished page occupies, so nothing jumps when
 * the data arrives, and it announces itself once for screen readers instead of
 * leaving them on a silent page.
 */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-12">
      <p role="status" className="sr-only">
        Loading your dashboard
      </p>

      <div className="flex flex-col gap-5">
        <Block className="h-4 w-40" />
        <Block className="h-9 w-72 max-w-full" />
        <Block className="h-16 w-full" />
      </div>

      {/* The next step is a deep-teal panel, so its placeholder is one too. */}
      <div
        aria-hidden="true"
        className="h-64 w-full animate-pulse border border-shell-border bg-shell/10"
      />

      <SectionSkeleton />
      <SectionSkeleton />
    </div>
  );
}
