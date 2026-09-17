import Link from "next/link";
import { ArrowRight, Circle, CircleCheck, CircleDot, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";

import { formatMinutes, progressLabel } from "../utils/format";
import { moduleRoute } from "../utils/my-learning-model";

const ICON_FOR_STATUS = {
  locked: Lock,
  available: Circle,
  in_progress: CircleDot,
  completed: CircleCheck,
};

/**
 * One module in a learner's list.
 *
 * The path is a genuine sequence, so a path row carries its priority number and
 * its reason; a browse row carries neither because it sits on no line at all.
 * The status is written out beside its icon, and progress adds a number only
 * when there is a number to add — "In progress · 42% done", not "Ready to
 * start · 0% done".
 */
export function ModuleRow({ row, number }) {
  const Icon = ICON_FOR_STATUS[row.statusValue] ?? Circle;
  const minutes = formatMinutes(row.minutes);
  const progress =
    !row.isComplete && row.completionPercentage > 0
      ? progressLabel({ percent: row.completionPercentage, isComplete: row.isComplete })
      : null;

  return (
    <li className="flex flex-col gap-4 border-t border-border px-5 py-5 first:border-t-0 sm:flex-row sm:items-start sm:gap-6">
      {number === null ? null : (
        <span
          aria-hidden="true"
          className="order-first flex size-7 shrink-0 items-center justify-center border border-input font-display text-sm font-semibold text-foreground"
        >
          {number}
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Link
          href={moduleRoute(row.moduleId)}
          className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          {row.title}
        </Link>

        <p className="text-sm text-muted-foreground">
          {row.competencyName}
          {minutes ? (
            <>
              {" "}· {minutes}
            </>
          ) : null}
        </p>

        {row.reason ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            {row.reason}
          </p>
        ) : null}

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-sm">
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <Icon aria-hidden="true" className="size-4 text-primary" />
            {row.pathStatus.label}
          </span>
          {progress ? <span className="text-muted-foreground">{progress}</span> : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center">
        <Button asChild className="h-10 px-4">
          <Link href={moduleRoute(row.moduleId)}>
            {row.cta}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </div>
    </li>
  );
}