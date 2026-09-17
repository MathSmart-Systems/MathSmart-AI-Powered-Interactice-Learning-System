"use client";

import React from "react";
import { Award, BookOpen, TrendingUp } from "lucide-react";

export function ProgressMetricCards({ model }) {
  const {
    overallMasteryFormatted,
    overallMastery,
    growthFormatted,
    growth,
    modulesCompleted,
    totalModules,
    moduleCompletionPercent,
    masteredCount,
    totalCompetencies,
    masteryPercent,
  } = model;

  const isPositiveGrowth = growth !== null && growth > 0;
  const isNegativeGrowth = growth !== null && growth < 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
      {/* 1. Overall Progress / Mastery */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Overall Progress
            </span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-foreground font-display">
              {overallMasteryFormatted}
            </span>
            {growth !== null && (
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                  isPositiveGrowth
                    ? "text-primary bg-primary/10"
                    : isNegativeGrowth
                    ? "text-destructive bg-destructive/10"
                    : "text-muted-foreground bg-muted"
                }`}
              >
                {growthFormatted} from baseline
              </span>
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, overallMastery || 0))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. Modules Completed */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Modules Completed
            </span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-foreground font-display">
              {modulesCompleted}{" "}
              <span className="text-lg font-bold text-muted-foreground">
                / {totalModules}
              </span>
            </span>
            <span className="text-xs text-muted-foreground font-medium">
              {moduleCompletionPercent}% finished
            </span>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, moduleCompletionPercent))}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* 3. Competencies Mastered */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Competencies Mastered
            </span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-foreground font-display">
              {masteredCount}{" "}
              <span className="text-lg font-bold text-muted-foreground">
                / {totalCompetencies}
              </span>
            </span>
            <span className="text-xs text-primary font-semibold">
              {masteredCount === totalCompetencies && totalCompetencies > 0
                ? "All Mastered!"
                : "Grade 6 Core"}
            </span>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, masteryPercent))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
