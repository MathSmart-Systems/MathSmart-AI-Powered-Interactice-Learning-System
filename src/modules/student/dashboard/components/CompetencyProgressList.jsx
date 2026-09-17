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

function CompetencyRow({ competency }) {
  const Icon = ICON_FOR_DIRECTION[competency.growth.direction] ?? Minus;
  const current = formatScore(competency.currentScore);
  const diagnostic = formatScore(competency.diagnosticScore);

  return (
    <li className="flex flex-col gap-2.5 p-4 rounded-xl bg-muted/20 border border-border">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 font-medium text-foreground text-xs sm:text-sm">{competency.name}</p>
        <p className="font-display text-base font-bold tracking-tight text-foreground">
          {current ?? "Not scored yet"}
        </p>
      </div>

      {competency.currentScore === null ? null : (
        <div aria-hidden="true" className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${Math.min(Math.max(competency.currentScore, 0), 100)}%` }}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 text-foreground font-medium">
          <BandGlyph fill={competency.band.fill} />
          {competency.band.label}
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Icon aria-hidden="true" className="size-3.5" />
          {competency.growth.text}
        </span>
        {diagnostic ? (
          <span className="text-muted-foreground">Baseline: {diagnostic}</span>
        ) : null}
      </div>
    </li>
  );
}

export function CompetencyProgressList({ competencies }) {
  return (
    <ul className="space-y-3">
      {competencies.map((competency, index) => (
        <CompetencyRow key={competency.id ?? index} competency={competency} />
      ))}
    </ul>
  );
}
