import React from "react";

import { formatGrowthPoints, formatScore } from "../utils/format";

/**
 * The learner's standing in four numbers, each shown once.
 *
 * Replaces four tall tiles that repeated the growth panel beneath them — the
 * same growth three times, the same scores twice, and in two roundings, so a
 * learner read 16.67% in one place and 17% a few centimetres lower. Every
 * figure here goes through the same formatter, and growth is counted in
 * points, because it is the difference between two percentages rather than a
 * percentage of anything.
 *
 * Two columns on a phone, four on a wide screen: the tiles used to stack one
 * per row on a phone, which is most of how the page reached five thousand
 * pixels.
 */
export function StatStrip({ plot, mastery, modules, diagnosticComplete }) {
  const figures = [
    {
      label: "Your mastery now",
      value: formatScore(plot.currentScore) ?? "—",
      detail: "Average of your topic scores",
    },
    {
      label: "Topics mastered",
      value:
        mastery.mastered === null || mastery.total === null
          ? "—"
          : `${mastery.mastered} of ${mastery.total}`,
      detail: "Grade 6 topics at Mastered",
    },
    {
      label: "Lessons finished",
      value: modules.hasPath ? `${modules.finished} of ${modules.total}` : "—",
      detail: modules.hasPath ? "On your learning path" : "No path yet",
    },
    {
      label: "Since your diagnostic",
      value: diagnosticComplete ? (formatGrowthPoints(plot.growthValue) ?? "—") : "—",
      detail: diagnosticComplete ? "Change in your mastery" : "Appears after your diagnostic",
    },
  ];

  return (
    <section aria-label="Your progress at a glance" className="rounded-2xl border border-border bg-card">
      <dl className="grid grid-cols-2 lg:grid-cols-4">
        {figures.map((figure, index) => (
          <div
            key={figure.label}
            className={`flex min-w-0 flex-col gap-1 p-4 ${
              index % 2 === 1 ? "border-l border-border" : ""
            } ${index >= 2 ? "border-t border-border lg:border-t-0" : ""} ${
              index === 2 ? "lg:border-l" : ""
            }`}
          >
            <dt className="text-xs font-medium text-muted-foreground">{figure.label}</dt>
            <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">
              {figure.value}
            </dd>
            <dd className="text-xs text-muted-foreground">{figure.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
