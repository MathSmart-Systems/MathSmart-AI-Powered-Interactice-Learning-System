import { BookOpen, GraduationCap } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * One competency in the catalogue.
 *
 * The status is stated twice — once in words, once as a quiet badge — because a
 * badge or a color must never carry meaning alone. The code and name are shown
 * as written; the card only picks the resting order. Interactive actions are
 * passed in from the view, so a future read-only surface can reuse the card.
 */
export function CompetencyCard({ competency, actions }) {
  return (
    <article className="flex flex-col gap-4 border border-border bg-card px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {competency.code}
        </p>
        <Badge variant={competency.statusBadge}>{competency.statusLabel}</Badge>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
          {competency.name}
        </h3>
        {competency.description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {competency.description}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <BookOpen aria-hidden="true" className="size-4" />
          {competency.domain}
        </span>
        {competency.gradeName ? (
          <span className="inline-flex items-center gap-1.5">
            <GraduationCap aria-hidden="true" className="size-4" />
            {competency.gradeName}
          </span>
        ) : null}
      </div>

      {actions ? (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {actions}
        </div>
      ) : null}
    </article>
  );
}