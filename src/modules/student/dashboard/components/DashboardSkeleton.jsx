function Block({ className }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-secondary motion-reduce:animate-none ${className}`}
    />
  );
}

function SectionSkeleton({ rows = 3 }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <Block className="h-5 w-44" />
      <Block className="h-3 w-64 max-w-full" />
      {Array.from({ length: rows }, (_, index) => (
        <Block key={index} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}

/**
 * The dashboard while it is first being read.
 *
 * Drawn in the finished page's own shape and rhythm — the header, the dark
 * next-step panel, the four-figure strip, then the two columns — so nothing
 * jumps when the data arrives. The version this replaced had no strip, no
 * columns and a different gap, so the page rearranged itself on arrival. It is
 * the route's first-load boundary only.
 */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-10">
      <p role="status" className="sr-only">
        Loading your dashboard
      </p>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Block className="h-4 w-40" />
          <Block className="h-9 w-72 max-w-full" />
        </div>
        <Block className="h-8 w-44 rounded-full" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-shell-border bg-shell p-5 sm:p-7">
        <div aria-hidden="true" className="h-6 w-24 animate-pulse rounded-md bg-shell-border motion-reduce:animate-none" />
        <div aria-hidden="true" className="h-8 w-80 max-w-full animate-pulse rounded bg-shell-border motion-reduce:animate-none" />
        <div aria-hidden="true" className="h-4 w-96 max-w-full animate-pulse rounded bg-shell-border motion-reduce:animate-none" />
        <div aria-hidden="true" className="mt-1 h-11 w-48 animate-pulse rounded-xl bg-shell-border motion-reduce:animate-none" />
      </div>

      <div className="grid grid-cols-2 rounded-2xl border border-border bg-card lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 p-4">
            <Block className="h-3 w-24" />
            <Block className="h-7 w-16" />
            <Block className="h-3 w-28 max-w-full" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <SectionSkeleton rows={2} />
          <SectionSkeleton rows={3} />
        </div>
        <div className="flex flex-col gap-5">
          <SectionSkeleton rows={2} />
          <SectionSkeleton rows={3} />
        </div>
      </div>
    </div>
  );
}
