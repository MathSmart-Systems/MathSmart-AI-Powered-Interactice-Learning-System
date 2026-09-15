function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse bg-secondary ${className}`} />;
}

function RowSkeleton() {
  return (
    <li>
      <div className="flex flex-col gap-1 border border-border bg-card px-5 py-5 sm:px-6">
        <Block className="h-4 w-3/5" />
        <Block className="mt-1 h-3 w-2/5" />
        <Block className="mt-3 h-3 w-1/3" />
      </div>
    </li>
  );
}

/**
 * The module library while its first read is still in flight. Reserves the
 * same shape the finished page occupies and announces itself once for screen
 * readers.
 */
export function LearningModulesSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <p role="status" className="sr-only">
        Loading the Learning Modules
      </p>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <Block className="h-4 w-36" />
          <Block className="h-9 w-64 max-w-full" />
        </div>
        <Block className="h-11 w-full" />
      </div>

      <ul className="flex flex-col gap-3">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </ul>

      <Block className="h-8 w-64 max-w-full" />
    </div>
  );
}