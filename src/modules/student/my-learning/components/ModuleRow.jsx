import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";

import { formatMinutes, progressLabel } from "../utils/format";
import { moduleRoute } from "../utils/my-learning-model";

import { StatusIcon } from "./StatusIcon";

/**
 * One module in a learner's list.
 *
 * The path is a genuine sequence, so a path row carries its priority number and
 * its reason; a browse row carries neither because it sits on no line at all.
 * The status is written out beside its icon, and progress adds a number only
 * when there is a number to add — "In progress · 42% done", not "Ready to
 * start · 0% done".
 *
 * A locked row is not offered. The database refuses a write against a locked
 * module outright, so a link to one is a promise the interface cannot keep: it
 * would spend a learner's click on a page they can read but not record
 * anything in. The row therefore drops both its links and states what would
 * open it. The control that replaces the call to action stays in the tab order
 * with `aria-disabled` rather than `disabled`, because a keyboard learner
 * tabbing down the path would otherwise skip straight past the row and never
 * meet the sentence explaining why it was skipped.
 */
export function ModuleRow({ row, number }) {
  const minutes = formatMinutes(row.minutes);
  const progress =
    !row.isComplete && row.completionPercentage > 0
      ? progressLabel({ percent: row.completionPercentage, isComplete: row.isComplete })
      : null;

  const locked = Boolean(row.isLocked);
  const lockReasonId = locked ? `module-${row.moduleId}-lock-reason` : undefined;
  const lockReason = row.blockedByTitle
    ? `Finish ${row.blockedByTitle} to open this`
    : "Finish the lessons before this one to open it";

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
        {locked ? (
          <p className="font-medium text-muted-foreground">{row.title}</p>
        ) : (
          <Link
            href={moduleRoute(row.moduleId)}
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            {row.title}
          </Link>
        )}

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
            <StatusIcon status={row.statusValue} className="size-4 text-primary" />
            {row.pathStatus.label}
          </span>
          {progress ? <span className="text-muted-foreground">{progress}</span> : null}
        </p>

        {locked ? (
          <p id={lockReasonId} className="max-w-prose text-sm leading-relaxed text-foreground">
            {lockReason}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center">
        {locked ? (
          <Button
            type="button"
            variant="outline"
            aria-disabled="true"
            aria-describedby={lockReasonId}
            className="h-10 cursor-not-allowed px-4 text-muted-foreground hover:bg-background hover:text-muted-foreground"
          >
            <Lock aria-hidden="true" className="size-4" />
            Opens later
          </Button>
        ) : (
          <Button asChild className="h-10 px-4">
            {/* "Continue" lands on the section the learner left off in: the
                lesson route restores the stored last section on arrival, so
                the row does not need to carry a section id the catalogue
                endpoint never returns. */}
            <Link href={moduleRoute(row.moduleId)}>
              {row.cta}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}
