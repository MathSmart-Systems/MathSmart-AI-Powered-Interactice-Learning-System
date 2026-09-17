"use client";

import React from "react";
import { Lock, ShieldCheck } from "lucide-react";

export function CompetencyOverviewSection({ competencies }) {
  const hasCompetencies = Array.isArray(competencies) && competencies.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-6 sm:p-8 shadow-xs space-y-6 transition-colors">
      <div>
        <h2 className="text-xl font-semibold text-foreground font-display tracking-tight">
          Class Competency Performance Overview
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          DepEd Grade 6 Mathematics curriculum progress and cohort mastery distribution.
        </p>
      </div>

      {!hasCompetencies ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          No competency performance data recorded for this selection yet.
        </p>
      ) : (
        <div className="space-y-6 pt-1">
          {competencies.map((comp) => {
            const isSuppressed = comp.isSuppressed;
            const score = comp.averageScore;
            const masteryBand = comp.masteryBand;

            const isMastered = masteryBand === "Mastered";
            const isDeveloping = masteryBand === "Developing";
            const isNeedsSupport = masteryBand === "Needs Support";

            const progressWidth = Math.min(100, Math.max(0, score || 0));

            return (
              <div key={comp.competencyId || comp.code} className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {comp.name}
                    </span>
                    <span className="text-xs font-mono-math text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                      {comp.code}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSuppressed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        <Lock className="size-3" aria-hidden="true" />
                        <span>Withheld (Privacy)</span>
                      </span>
                    ) : (
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          isMastered
                            ? "bg-primary/10 text-primary border border-primary/20 font-semibold"
                            : isDeveloping
                            ? "bg-secondary text-secondary-foreground border border-border"
                            : "bg-destructive/10 text-destructive border border-destructive/20 font-semibold"
                        }`}
                      >
                        {comp.averageFormatted} • {masteryBand}
                      </span>
                    )}
                  </div>
                </div>

                {/* Visual Progress Bar */}
                <div
                  className="h-2 w-full bg-secondary border border-border/60 rounded-full overflow-hidden"
                  aria-hidden="true"
                >
                  {!isSuppressed && (
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isNeedsSupport ? "bg-destructive" : "bg-primary"
                      }`}
                      style={{ width: `${progressWidth}%` }}
                    />
                  )}
                </div>

                {/* Cohort Breakdown Indicators */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground pt-0.5">
                  <div className="flex items-center gap-3">
                    <span>
                      <strong className="text-foreground font-semibold">{comp.masteredCount}</strong> Mastered
                    </span>
                    <span>•</span>
                    <span>
                      <strong className="text-foreground font-semibold">{comp.developingCount}</strong> Developing
                    </span>
                    <span>•</span>
                    <span>
                      <strong className="text-foreground font-semibold">{comp.needsImprovementCount}</strong> Needs Support
                    </span>
                  </div>

                  {isSuppressed && (
                    <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                      <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
                      Individual averages suppressed for small cohorts (&lt;5 students)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
