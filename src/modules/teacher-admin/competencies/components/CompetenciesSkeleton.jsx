function Block({ className }) {
  return <div aria-hidden="true" className={`animate-pulse bg-secondary ${className}`} />;
}

/**
 * One card's resting shape.
 *
 * Every competency now carries its actions — Publish or Unpublish, Edit and
 * Archive, or Restore and Delete — so the row of buttons is part of the shape
 * a card occupies rather than something only some cards have. Without a
 * placeholder for it the grid grew by a button's height per row the moment the
 * data arrived.
 */
function CardSkeleton() {
  return (
    <div className="flex flex-col gap-4 border border-border bg-card px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <Block className="h-4 w-24" />
        <Block className="h-5 w-16 rounded-full" />
      </div>

      <div className="flex flex-col gap-1">
        <Block className="h-7 w-4/5" />
        <Block className="h-4 w-full" />
        <Block className="h-4 w-2/3" />
      </div>

      {/* The meta row sits under a rule on the real card. */}
      <div className="flex items-center gap-4 border-t border-border pt-3">
        <Block className="h-4 w-28" />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Block className="h-9 w-24" />
        <Block className="h-9 w-20" />
        <Block className="h-9 w-24" />
      </div>
    </div>
  );
}

/**
 * The competency catalogue while it is still being read.
 *
 * Every block is sized against the element it stands in for, measured on the
 * rendered page rather than guessed: the heading is `text-3xl sm:text-4xl`, so
 * its placeholder is `h-11`; the search field is `h-11`, not `h-10`; and there
 * are four filter buttons, not three.
 *
 * The primary action is drawn where it actually sits — on the heading row,
 * right-aligned — and as a visible block. It used to be reserved below the
 * description as a bare `div` with no background, which is to say as an
 * invisible gap in the wrong place.
 */
export function CompetenciesSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <p role="status" className="sr-only">
        Loading the competency catalogue
      </p>

      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2">
          <Block className="h-5 w-40" />
          <Block className="h-11 w-56 max-w-full" />
          <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
          <Block className="mt-1 h-5 w-full max-w-xl" />
        </div>
        <Block className="h-11 w-40 shrink-0" />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <Block className="h-11 w-full max-w-xs" />
          <div className="flex flex-wrap gap-2">
            <Block className="h-9 w-16" />
            <Block className="h-9 w-20" />
            <Block className="h-9 w-28" />
            <Block className="h-9 w-24" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </div>
  );
}
