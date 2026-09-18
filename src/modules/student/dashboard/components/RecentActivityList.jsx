import React from "react";
import { formatScore, formatWhen, toDateTimeAttribute } from "../utils/format";

/**
 * Recent Activity list conforming to the MathSmart UI/UX reference.
 * Renders completed practice and assessments with status dots, scores, and dates.
 */
export function RecentActivityList({ activity }) {
  return (
    <ul className="space-y-3 text-xs">
      {activity.map((record) => {
        const when = formatWhen(record.date);
        const score = formatScore(record.score);
        const dateTime = toDateTimeAttribute(record.date);

        return (
          <li
            key={record.id}
            className="pb-3 border-b border-border/70 last:border-b-0 flex items-start gap-2.5"
          >
            <div className="size-2 rounded-full bg-primary mt-1.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold text-foreground text-xs">{record.title ?? record.label}</p>
                {score !== null && (
                  <span className="font-display text-xs font-bold text-primary shrink-0">
                    {score}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {record.title ? <span>{record.label}</span> : null}
              </p>
              {when ? (
                <div className="text-[10px] text-muted-foreground/80 mt-1">
                  {dateTime ? <time dateTime={dateTime}>{when}</time> : <span>{when}</span>}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
