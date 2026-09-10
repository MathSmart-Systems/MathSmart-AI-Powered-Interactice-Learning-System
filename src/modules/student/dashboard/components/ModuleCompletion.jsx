const CELL_MIN = 3;
const CELL_MAX = 16;

/**
 * Module completion counted in graph-paper cells.
 *
 * One cell per published module, filled as each is finished, so what is left is
 * something a learner can see at a glance and count if they want to. A very
 * short course, or one longer than a screenful, falls back to a measured rule
 * instead. The sentence above carries the same fact in words either way.
 */
export function ModuleCompletion({ finished, total, percent }) {
  if (total <= 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        No modules are published for your grade yet, so there is nothing to finish here
        so far.
      </p>
    );
  }

  const useCells = total >= CELL_MIN && total <= CELL_MAX;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-foreground">
        <span className="font-medium">
          {finished} of {total}
        </span>{" "}
        {total === 1 ? "module" : "modules"} finished
        {percent === null ? "" : ` (${percent}%)`}
      </p>

      {useCells ? (
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${total * 18} 18`}
          className="h-4 w-auto max-w-full"
          preserveAspectRatio="xMinYMid meet"
        >
          {Array.from({ length: total }, (_, index) => (
            <rect
              key={index}
              x={index * 18 + 1}
              y="1"
              width="16"
              height="16"
              className={
                index < finished ? "fill-primary stroke-primary" : "fill-none stroke-input"
              }
              strokeWidth="1.5"
            />
          ))}
        </svg>
      ) : (
        <div
          aria-hidden="true"
          className="h-3 w-full max-w-[20rem] border border-input bg-secondary"
        >
          <div className="h-full bg-primary" style={{ width: `${percent ?? 0}%` }} />
        </div>
      )}
    </div>
  );
}
