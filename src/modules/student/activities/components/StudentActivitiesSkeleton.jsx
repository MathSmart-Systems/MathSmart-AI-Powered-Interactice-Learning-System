import { Shapes } from "lucide-react";

function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse bg-secondary ${className}`} />;
}

function ActivitySkeletonRow() {
  return (
    <div className="border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 space-y-3">
          <Block className="h-4 w-40" />
          <Block className="h-5 w-72 max-w-full" />
          <Block className="h-4 w-full" />
          <Block className="h-3 w-56" />
        </div>
        <Block className="h-8 w-24 shrink-0" />
      </div>
    </div>
  );
}

/**
 * While the activity list is loading, the learner sees a shape that reserves
 * the same horizontal space the finished page occupies.
 */
export function StudentActivitiesSkeleton() {
  return (
    // No `aria-labelledby`: it pointed at the real page's heading, which does
    // not exist yet while this is on screen, so it named nothing. A spoken
    // line of its own is what a screen reader actually needs here.
    <div className="flex flex-col gap-10">
      <p role="status" className="sr-only">
        Loading your activities
      </p>

      <div className="flex flex-col gap-2">
        <Block className="h-4 w-44" />
        <Block className="h-9 w-72 max-w-full" />
        <Block className="h-4 w-full max-w-md" />
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-md bg-primary/10 p-2"><Shapes aria-hidden="true" className="size-5 text-primary" /></div>
        <Block className="h-4 w-52" />
      </div>

      <div className="flex flex-col gap-4">
        <ActivitySkeletonRow />
        <ActivitySkeletonRow />
        <ActivitySkeletonRow />
      </div>
    </div>
  );
}