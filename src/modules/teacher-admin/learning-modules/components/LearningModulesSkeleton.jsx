import { DEFAULT_PAGE_SIZE } from "../constants";

/** Renders one decorative placeholder block in the loading layout. */
function Block({ className }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-secondary motion-reduce:animate-none ${className}`}
    />
  );
}

/** Reserves the layout occupied by one loaded module row. */
function RowSkeleton() {
  return (
    <li>
      <div className="flex flex-col gap-4 border border-border bg-card px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Block className="h-5 w-20 rounded-full" />
            <Block className="h-5 w-40 max-w-full rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Block className="h-8 w-20 rounded-md" />
            <Block className="h-8 w-24 rounded-md" />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Block className="h-6 w-3/4" />
          <Block className="mt-1 h-4 w-2/5" />
        </div>
      </div>
    </li>
  );
}

/**
 * The library while its first read is still in flight.
 *
 * It reserves the shape the finished page occupies, block for block: the intro
 * note, the search row, the state tabs, a full page of rows and the footer. The
 * previous version left out the tabs and the intro entirely and drew three
 * half-height rows against a page of ten, so the content jumped several hundred
 * pixels the moment the read resolved.
 */
export function LearningModulesSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <p role="status" className="sr-only">
        Loading the Learning Modules
      </p>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Block className="h-5 w-48" />
          <Block className="h-9 w-72 max-w-full" />
          <Block className="mt-1 h-0.5 w-16" />
        </div>

        <Block className="h-24 w-full max-w-2xl" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <Block className="h-9 w-full sm:max-w-80" />
          <Block className="h-9 w-32" />
        </div>
      </div>

      <div className="flex items-center gap-5 border-b border-border pb-2.5">
        <Block className="h-5 w-24" />
        <Block className="h-5 w-16" />
        <Block className="h-5 w-20" />
      </div>

      <ul className="flex flex-col gap-3">
        {Array.from({ length: DEFAULT_PAGE_SIZE }).map((_, index) => (
          <RowSkeleton key={index} />
        ))}
      </ul>

      <div className="flex flex-col gap-4">
        <Block className="h-5 w-64 max-w-full" />
        <Block className="h-8 w-full" />
      </div>
    </div>
  );
}
