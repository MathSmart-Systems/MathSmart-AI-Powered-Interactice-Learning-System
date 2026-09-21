/**
 * The first load of Reports, shaped like the report it becomes: header,
 * filters, the five-figure strip, the competency panel and the student list.
 * Shown only on arrival; a change of filter keeps the report on screen.
 */
function Block({ className = "" }) {
  return <div className={`rounded-md bg-muted ${className}`} />;
}

export function ReportsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading the report">
      <div className="flex flex-wrap items-end justify-between gap-4 animate-pulse motion-reduce:animate-none">
        <div className="flex flex-col gap-2">
          <Block className="h-4 w-28" />
          <Block className="h-9 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Block className="h-8 w-28" />
          <Block className="h-8 w-20" />
        </div>
      </div>
      <div className="h-[8.5rem] rounded-xl border border-border bg-card xl:h-[5.5rem]" />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className={`flex flex-col gap-2 bg-card p-4 ${index === 4 ? "col-span-2 lg:col-span-1" : ""}`}>
            <Block className="h-3 w-20" />
            <Block className="h-7 w-14" />
            <Block className="h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <Block className="h-5 w-48" />
        {Array.from({ length: 5 }, (_, index) => (
          <Block key={index} className="h-10 w-full" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-border bg-card" />
    </div>
  );
}
