import { formatScore, formatWhen, toDateTimeAttribute } from "../utils/format";

/**
 * What the learner has finished lately, newest first, exactly as the API
 * ordered it. The date is a real `<time>` element and the score is written as a
 * number, so nothing here depends on being able to see a colour.
 */
export function RecentActivityList({ activity }) {
  return (
    <ul className="flex flex-col border border-border bg-card">
      {activity.map((record) => {
        const when = formatWhen(record.date);
        const score = formatScore(record.score);
        const dateTime = toDateTimeAttribute(record.date);

        return (
          <li
            key={record.id}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-border px-5 py-4 first:border-t-0"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-medium text-foreground">{record.title ?? record.label}</p>
              <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                {record.title ? <span>{record.label}</span> : null}
                {when ? (
                  dateTime ? (
                    <time dateTime={dateTime}>{when}</time>
                  ) : (
                    <span>{when}</span>
                  )
                ) : null}
              </p>
            </div>

            <p className="font-display text-lg font-semibold tracking-tight text-foreground">
              {score ?? "No score"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
