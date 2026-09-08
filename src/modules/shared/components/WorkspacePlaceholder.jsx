import { Ruler } from "lucide-react";

/**
 * Shared development-state screen for a destination whose interface has not been
 * built yet. It deliberately shows no metrics, records, or loading skeletons:
 * nothing here is waiting for data.
 */
export function WorkspacePlaceholder({ title, workspaceName }) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{workspaceName}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
      </header>

      <section
        aria-labelledby="ui-in-progress-heading"
        className="max-w-2xl border-l-[3px] border-border bg-card px-6 py-6"
      >
        <div className="flex items-center gap-2.5 text-primary">
          <Ruler aria-hidden="true" className="size-4" />
          <h2 id="ui-in-progress-heading" className="text-base font-semibold">
            UI in progress
          </h2>
        </div>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          This MathSmart workspace is being prepared. The navigation is ready, and
          this feature will be added in its assigned module.
        </p>
      </section>
    </div>
  );
}
