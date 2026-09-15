function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse bg-secondary ${className}`} />;
}

/**
 * The profile while it is still being read.
 *
 * It reserves the same shape the finished page occupies, so nothing jumps when
 * the data arrives, and it announces itself once for screen readers instead of
 * leaving them on a silent page.
 */
export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <p role="status" className="sr-only">
        Loading your profile
      </p>

      <div className="flex flex-col gap-3">
        <Block className="h-4 w-40" />
        <Block className="h-9 w-80 max-w-full" />
        <Block className="h-4 w-2/3 max-w-xl" />
      </div>

      <div className="flex flex-col gap-6 border border-border bg-card px-6 py-7 sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Block className="size-20 rounded-xl" />
            <div className="flex flex-col gap-2">
              <Block className="h-6 w-44" />
              <Block className="h-4 w-56" />
            </div>
          </div>
          <Block className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Block className="h-12 w-full" />
          <Block className="h-12 w-full" />
          <Block className="h-12 w-full" />
        </div>
      </div>

      <div className="flex flex-col gap-6 border border-border bg-card px-6 py-7 sm:px-8">
        <Block className="h-6 w-40" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Block className="h-32 w-full" />
          <Block className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}