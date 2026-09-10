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
 * One competency, measured twice.
 *
 * The rule under each row is the same idea as the big plot at a smaller scale:
 * the filled length is where the learner stands now, and the notch is where the
 * diagnostic put them. A drop is never marked in the marking-pen red — a score
 * that moved the wrong way is information, not a fault.
 */
function CompetencyRow({ competency }) {
  const Icon = ICON_FOR_DIRECTION[competency.growth.direction] ?? Minus;
  const current = formatScore(competency.currentScore);
  const diagnostic = formatScore(competency.diagnosticScore);

  return (
    <li className="flex flex-col gap-3 border-t border-border px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="min-w-0 font-medium text-foreground">{competency.name}</p>
        <p className="font-display text-lg font-semibold tracking-tight text-foreground">
          {current ?? "Not scored yet"}
        </p>
      </div>

      {competency.currentScore === null ? null : (
        <div aria-hidden="true" className="relative h-2.5 border border-input bg-secondary">
          <div
            className="h-full bg-primary"
            style={{ width: `${Math.min(Math.max(competency.currentScore, 0), 100)}%` }}
          />
          {competency.diagnosticScore === null ? null : (
            <span
              className="absolute top-[-3px] bottom-[-3px] w-px bg-foreground"
              style={{
                left: `${Math.min(Math.max(competency.diagnosticScore, 0), 100)}%`,
              }}
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
        <span className="inline-flex items-center gap-2 text-foreground">
          <BandGlyph fill={competency.band.fill} />
          {competency.band.label}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
          {competency.growth.text}
        </span>
        {diagnostic ? (
          <span className="text-muted-foreground">Diagnostic {diagnostic}</span>
        ) : null}
      </div>
    </li>
  );
}

export function CompetencyProgressList({ competencies }) {
  return (
    <ul className="flex flex-col border border-border bg-card">
      {competencies.map((competency, index) => (
        <CompetencyRow key={competency.id ?? index} competency={competency} />
      ))}
    </ul>
  );
}
