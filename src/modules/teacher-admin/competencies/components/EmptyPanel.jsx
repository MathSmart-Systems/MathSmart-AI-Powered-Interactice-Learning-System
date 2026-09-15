/**
 * What the catalogue says when a list is empty.
 *
 * It names what would appear and puts the person back in control of it: either
 * there is no catalogue yet (so the add action is the way in) or the search
 * and filters hid everything (so clearing them is the way out).
 */
export function EmptyPanel({ title, description, action }) {
  return (
    <div className="flex flex-col gap-4 border-l-[3px] border-border bg-card px-5 py-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action ? <div className="flex flex-wrap items-center gap-3">{action}</div> : null}
    </div>
  );
}