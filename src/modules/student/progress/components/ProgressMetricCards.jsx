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
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Overall Progress
            </span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100 font-display">
              {overallMasteryFormatted}
            </span>
            {growth !== null && (
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                  isPositiveGrowth
                    ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300"
                    : isNegativeGrowth
                    ? "text-rose-700 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-300"
                    : "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {growthFormatted} from baseline
              </span>
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, overallMastery || 0))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. Modules Completed */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Modules Completed
            </span>
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100 font-display">
              {modulesCompleted} <span className="text-lg font-bold text-slate-400">/ {totalModules}</span>
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {moduleCompletionPercent}% finished
            </span>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, moduleCompletionPercent))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. Competencies Mastered */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Competencies Mastered
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100 font-display">
              {masteredCount} <span className="text-lg font-bold text-slate-400">/ {totalCompetencies}</span>
            </span>
            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
              {masteredCount === totalCompetencies && totalCompetencies > 0
                ? "All Mastered!"
                : "Grade 6 Core"}
            </span>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, masteryPercent))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
