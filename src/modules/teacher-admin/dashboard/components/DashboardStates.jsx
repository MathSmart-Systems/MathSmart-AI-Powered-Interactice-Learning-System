function Block({ className }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-secondary motion-reduce:animate-none ${className}`}
    />
  );
}

function PanelSkeleton({ rows, className = "" }) {
  return (
    <div className={`flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}>
      <Block className="h-5 w-48 max-w-full" />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Block className="size-9 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Block className="h-4 w-40 max-w-full" />
            <Block className="h-3 w-64 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The dashboard while it is first being read.
 *
 * Reserves the shape the finished page occupies — the header and filter, the
 * four-figure strip, the support list and competencies on the left, the
 * intervention split and recent activity on the right, and the quick links —
 * so nothing moves when the data arrives. It is the route's loading boundary
 * and nothing else: choosing a section keeps the current dashboard on screen
 * and dims it, it never brings this back.
 */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <p role="status" className="sr-only">
        Loading the class dashboard
      </p>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Block className="h-4 w-28" />
          <Block className="h-9 w-72 max-w-full" />
          <span aria-hidden="true" className="h-0.5 w-16 bg-primary" />
        </div>
        <Block className="h-9 w-full sm:w-64" />
      </div>

      <div className="min-h-5" />

      <div className="grid grid-cols-2 rounded-xl border border-border bg-card lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 p-4">
            <Block className="h-3 w-20" />
            <Block className="h-7 w-16" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={4} />
        </div>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
            <Block className="h-5 w-32" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }, (_, index) => (
                <Block key={index} className="h-19" />
              ))}
            </div>
          </div>
          <PanelSkeleton rows={4} />
        </div>
      </div>
    </div>
  );
}
