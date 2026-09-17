"use client";

import { Badge } from "@/components/ui/badge";
import { formatAnsweredCount } from "../utils/format.js";

/**
 * The sticky player chrome: question position, competency, answered count and
 * the progress bar. Both the count and the bar carry the same meaning, so the
 * state is never conveyed by colour alone.
 */
export function ActivityProgress({
  index = 0,
  total = 0,
  competencyName = null,
  answeredCount = 0,
  progress = null,
}) {
  const count = formatAnsweredCount(answeredCount, total);

  return (
    <div className="sticky top-0 z-20 -mx-5 border-b border-border bg-background/95 px-5 pt-4 pb-4 backdrop-blur-sm sm:-mx-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">
            Question {index + 1}
          </span>
          <span className="text-sm text-muted-foreground">of {total}</span>
        </p>

        <div className="flex items-center gap-3">
          {competencyName && (
            <Badge variant="outline" className="font-normal">
              {competencyName}
            </Badge>
          )}
          <span className="text-xs tabular-nums text-muted-foreground">
            <span className="sr-only">Answered</span>
            {count.text} answered
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuenow={progress ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Activity progress"
          className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${progress ?? 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}