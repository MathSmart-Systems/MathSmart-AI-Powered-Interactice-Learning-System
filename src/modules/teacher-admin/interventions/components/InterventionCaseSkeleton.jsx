function Block({ className }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-secondary motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * One intervention case while it is still being read.
 *
 * Reserves the shape the finished page occupies — the back link, the header
 * with its severity rule, the evidence strip, the two evidence lists, then the
 * form — so nothing moves when the case arrives. The advisory panel gets no
 * placeholder: nothing is generated until a teacher asks for it, and holding
 * space for text that may never be requested would be a promise the page has
 * not made.
 */
export function InterventionCaseSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <p role="status" className="sr-only">
        Loading the intervention case
      </p>

      <Block className="h-4 w-48" />

      <header className="border-l-[3px] border-border pl-4">
        <Block className="h-8 w-64 max-w-full" />
        <Block className="mt-2 h-4 w-80 max-w-full" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Block className="h-6 w-20 rounded-full" />
          <Block className="h-6 w-24 rounded-full" />
        </div>
      </header>

      <div className="rounded-xl border border-border bg-secondary/30 p-4">
        <Block className="h-4 w-44" />
        <div className="mt-3 flex flex-wrap gap-x-10 gap-y-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <Block className="h-3 w-28" />
              <Block className="h-6 w-16" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-4">
            <Block className="h-4 w-52 max-w-full" />
            <Block className="mt-3 h-3 w-full" />
            <Block className="mt-2 h-3 w-4/5" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <Block className="h-5 w-64 max-w-full" />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Block key={index} className="h-9" />
          ))}
        </div>
        <Block className="mt-4 h-20 w-full" />
      </div>
    </div>
  );
}
