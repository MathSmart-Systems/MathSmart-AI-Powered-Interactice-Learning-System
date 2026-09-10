import { Circle, CircleCheck, CircleDot, Lock } from "lucide-react";

import { formatMinutes } from "../utils/format";

const ICON_FOR_STATUS = {
  locked: Lock,
  available: Circle,
  in_progress: CircleDot,
  completed: CircleCheck,
};

/**
 * The learning path, in the order the API put it in.
 *
 * This is a genuine sequence, so it is a numbered list and the numbers mean the
 * priority the backend assigned — not decoration. Each step carries the reason
 * it is on the path, because a learner deserves to know why they were sent
 * there, and the status is written out next to its icon.
 */
export function LearningPathPreview({ items }) {
  return (
    <ol className="flex flex-col border border-border bg-card">
      {items.map((item, index) => {
        const Icon = ICON_FOR_STATUS[item.status] ?? Circle;
        const minutes = formatMinutes(item.estimatedMinutes);

        return (
          <li
            key={item.id ?? index}
            className="flex gap-4 border-t border-border px-5 py-4 first:border-t-0"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-7 shrink-0 items-center justify-center border border-input font-display text-sm font-semibold text-foreground"
            >
              {item.priority ?? index + 1}
            </span>

            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="font-medium text-foreground">{item.moduleTitle}</p>

              {item.competencyName ? (
                <p className="text-sm text-muted-foreground">{item.competencyName}</p>
              ) : null}

              {item.reason ? (
                <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                  {item.reason}
                </p>
              ) : null}

              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-sm">
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  <Icon aria-hidden="true" className="size-4 text-primary" />
                  {item.statusLabel}
                </span>
                {minutes ? <span className="text-muted-foreground">{minutes}</span> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
