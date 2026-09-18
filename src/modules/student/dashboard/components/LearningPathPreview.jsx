import React from "react";
import { Circle, CircleCheck, CircleDot, Lock } from "lucide-react";

import { formatMinutes } from "../utils/format";

const ICON_FOR_STATUS = {
  locked: Lock,
  available: Circle,
  in_progress: CircleDot,
  completed: CircleCheck,
};

/**
 * Sequential learning journey roadmap conforming to the MathSmart UI/UX reference.
 * Renders individual steps as clean status cards with progress badges.
 */
export function LearningPathPreview({ items }) {
  return (
    <ol className="space-y-3">
      {items.map((item, index) => {
        const Icon = ICON_FOR_STATUS[item.status] ?? Circle;
        const minutes = formatMinutes(item.estimatedMinutes);
        const isCompleted = item.status === "completed";
        const isInProgress = item.status === "in_progress";

        return (
          <li
            key={item.id ?? index}
            className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl gap-3 transition-colors ${
              isInProgress
                ? "bg-primary/5 border-2 border-primary/40 shadow-xs"
                : isCompleted
                ? "bg-muted/30 border border-border"
                : "bg-muted/15 border border-border/70"
            }`}
          >
            <div className="flex items-start gap-3 min-w-0">
              <div
                aria-hidden="true"
                className={`size-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 sm:mt-0 ${
                  isCompleted
                    ? "bg-primary/15 text-primary"
                    : isInProgress
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? "✓" : isInProgress ? "●" : (item.priority ?? index + 1)}
              </div>

              <div className="min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-bold text-foreground">
                    {item.moduleTitle}
                  </h3>
                  {isInProgress && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                      CURRENT
                    </span>
                  )}
                </div>

                {item.competencyName ? (
                  <p className="text-[11px] text-muted-foreground">{item.competencyName}</p>
                ) : null}

                {item.reason ? (
                  <p className="text-[11px] text-muted-foreground/80 leading-normal">
                    {item.reason}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0 text-xs">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium text-[11px] border whitespace-nowrap ${
                  isCompleted
                    ? "bg-primary/10 text-primary border-primary/20"
                    : isInProgress
                    ? "bg-primary text-primary-foreground border-primary font-semibold"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                <Icon aria-hidden="true" className="size-3" />
                <span>{item.statusLabel}</span>
              </span>
              {minutes ? <span className="text-[11px] text-muted-foreground">{minutes}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
