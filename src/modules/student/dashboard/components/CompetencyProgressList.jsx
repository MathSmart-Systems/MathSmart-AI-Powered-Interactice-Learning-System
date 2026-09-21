import React from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { formatScore } from "../utils/format";
import { BandGlyph } from "./BandGlyph";

const ICON_FOR_DIRECTION = {
  up: TrendingUp,
  down: TrendingDown,
  level: Minus,
  unknown: Minus,
};

/**
 * One topic as one row: name and score, a bar, and the band in words.
 *
 * Rows rather than cards. Each topic used to be its own bordered box with
 * three lines of detail, and five of them were most of the page on a phone.
 * The band is always written out beside its glyph, so the bar's length and
 * colour are never the only thing saying how a topic is going.
 */
function CompetencyRow({ competency }) {
  const Icon = ICON_FOR_DIRECTION[competency.growth.direction] ?? Minus;
  const current = formatScore(competency.currentScore);

  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 text-sm font-medium text-foreground">{competency.name}</p>
        <p className="shrink-0 font-display text-base font-semibold tabular-nums text-foreground">
          {current ?? "Not scored yet"}
        </p>
      </div>

      {competency.currentScore === null ? null : (
        <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(Math.max(competency.currentScore, 0), 100)}%` }}
          />
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <BandGlyph fill={competency.band.fill} />
          {competency.band.label}
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Icon aria-hidden="true" className="size-3.5" />
          {competency.growth.text}
        </span>
      </p>
    </li>
  );
}

export function CompetencyProgressList({ competencies }) {
  return (
    <ul className="divide-y divide-border">
      {competencies.map((competency, index) => (
        <CompetencyRow key={competency.id ?? index} competency={competency} />
      ))}
    </ul>
  );
}
