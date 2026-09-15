import { ModuleBadges, StatusBadge } from "./ModuleBadges";

/**
 * One module in the library list. Purely presentational: the row's controls
 * arrive as a `actions` node rendered by the parent, so the row never talks to
 * the API itself or decides what a teacher may do. Archived rows are visually
 * set aside but keep their title readable, because they still matter to the
 * learners who studied them.
 */
export function ModuleRow({ module, actions }) {
  const archived = module.status === "archived";
  const meta = moduleMeta(module);

  return (
    <li>
      <div
        className={
          archived
            ? "flex flex-col gap-4 border border-border bg-secondary/50 px-5 py-5 sm:px-6"
            : "flex flex-col gap-4 border border-border bg-card px-5 py-5 sm:px-6"
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={module.status} label={module.statusLabel} />
            <ModuleBadges
              competency={module.competency}
              rulesCount={module.rulesCount}
              workedExamplesCount={module.workedExamplesCount}
            />
          </div>

          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>

        <div className="flex flex-col gap-1">
          <h3
            className={
              archived
                ? "font-display text-lg leading-snug font-semibold tracking-tight text-muted-foreground"
                : "font-display text-lg leading-snug font-semibold tracking-tight text-foreground"
            }
          >
            {module.title}
          </h3>

          {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
        </div>
      </div>
    </li>
  );
}

function moduleMeta(module) {
  const bits = [];

  if (module.orderIndex !== null && module.orderIndex !== undefined) {
    bits.push(`Order ${module.orderIndex}`);
  }

  if (module.estimatedMinutes !== null && module.estimatedMinutes !== undefined) {
    bits.push(`${module.estimatedMinutes} mins`);
  }

  if (module.version !== null && module.version !== undefined) {
    bits.push(`Version ${module.version}`);
  }

  if (module.updatedLabel) {
    bits.push(module.updatedLabel);
  }

  return bits.length > 0 ? bits.join(" · ") : null;
}