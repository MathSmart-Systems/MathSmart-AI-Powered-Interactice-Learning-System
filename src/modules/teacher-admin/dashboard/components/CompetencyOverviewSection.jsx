"use client";

import React from "react";
import { Lock, ShieldCheck } from "lucide-react";

export function CompetencyOverviewSection({ competencies }) {
  const hasCompetencies = Array.isArray(competencies) && competencies.length > 0;

  return (
    <div className="bg-card rounded-2xl p-6 sm:p-8 border border-border shadow-xs space-y-6 transition-colors">
      <div>
        <h2 className="text-xl font-bold text-foreground font-display tracking-tight">
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
                    <span className="text-[11px] font-mono-math text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                      {comp.code}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSuppressed ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                        <Lock className="size-3" />
                        <span>Withheld (Privacy)</span>
                      </span>
                    ) : (
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                          isMastered
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                            : isDeveloping
                            ? "bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800"
                            : "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
                        }`}
                      >
                        {comp.averageFormatted} • {masteryBand}
                      </span>
                    )}
                  </div>
                </div>

                {/* Visual Progress Bar */}
                <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                  {!isSuppressed && (
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isMastered
                          ? "bg-emerald-600 dark:bg-emerald-500"
                          : isDeveloping
                          ? "bg-sky-600 dark:bg-sky-500"
                          : "bg-destructive"
                      }`}
                      style={{ width: `${progressWidth}%` }}
                    />
                  )}
                </div>

                {/* Cohort Breakdown Indicators */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground pt-0.5">
                  <div className="flex items-center gap-3">
                    <span>
                      <strong className="text-foreground">{comp.masteredCount}</strong> Mastered
                    </span>
                    <span>•</span>
                    <span>
                      <strong className="text-foreground">{comp.developingCount}</strong> Developing
                    </span>
                    <span>•</span>
                    <span>
                      <strong className="text-foreground">{comp.needsImprovementCount}</strong> Needs Support
                    </span>
                  </div>

                  {isSuppressed && (
                    <span className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                      <ShieldCheck className="size-3 text-primary" />
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
