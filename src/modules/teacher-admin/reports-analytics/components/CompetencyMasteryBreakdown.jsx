import { cn } from "cn";
import { masteryColor, masteryBarColor } from "../utils/labels";

export function CompetencyMasteryBreakdown({ competencies }) {
  if (!competencies || competencies.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
        <h3 className="font-display text-base font-semibold text-foreground">
          Competency Mastery Breakdown
        </h3>
        <p className="mt-4 text-sm text-muted-foreground">
          No competency data available yet. Learners need to complete assessments and activities first.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-foreground">
          Competency Mastery Breakdown
        </h3>
        <span className="text-xs text-muted-foreground font-medium">Class Composite</span>
      </div>

      <div className="space-y-4">
        {competencies.map((comp) => {
          const score = comp.average_current_score;
          const hidden = comp.suppressed;

          return (
            <div key={comp.competency_id} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground">{comp.name}</span>
                <span className={cn("font-mono font-bold", masteryColor(score))}>
                  {hidden ? "Hidden" : score != null ? `${score}% Mastery` : "N/A"}
                </span>
              </div>

              <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                {!hidden && score != null ? (
                  <div
                    className={cn("h-full rounded-full transition-all", masteryBarColor(score))}
                    style={{ width: `${score}%` }}
                  />
                ) : null}
              </div>

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{comp.mastered_count ?? 0} mastered</span>
                <span>{comp.developing_count ?? 0} developing</span>
                <span>{comp.needs_improvement_count ?? 0} needs improvement</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
