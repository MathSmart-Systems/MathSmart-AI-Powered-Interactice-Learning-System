function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse bg-secondary ${className}`} />;
}

/**
 * The player while its activity and attempt are still being read, and only
 * while there is nothing to show instead — once the player has content, a
 * reload dims it rather than replacing it with this.
 *
 * Reserves the shape of the finished screen and announces loading to screen
 * readers. The sticky strip repeats the real bar's negative margins, including
 * at `lg`, so the two do not sit at different widths as one becomes the other.
 */
export function ActivityPlayerSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <p role="status" className="sr-only">
        Loading your activity
      </p>

      <div className="flex flex-col gap-2">
        <Block className="h-4 w-40" />
        <Block className="h-9 w-80 max-w-full" />
        <Block className="h-4 w-72 max-w-full" />
      </div>

      <div className="sticky top-0 z-20 -mx-5 border-b border-border bg-background/95 px-5 py-4 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
        <div className="flex items-center justify-between gap-3">
          <Block className="h-4 w-36" />
          <Block className="h-6 w-28" />
        </div>
        <Block className="mt-4 h-1.5 w-full" />
      </div>

      <div className="border border-border bg-card px-6 py-8">
        <Block className="h-6 w-3/4" />
        <div className="mt-6 flex flex-col gap-3">
          <Block className="h-16 w-full" />
          <Block className="h-16 w-full" />
          <Block className="h-16 w-full" />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Block className="h-9 w-24" />
        <Block className="h-9 w-32" />
      </div>
    </div>
  );
}