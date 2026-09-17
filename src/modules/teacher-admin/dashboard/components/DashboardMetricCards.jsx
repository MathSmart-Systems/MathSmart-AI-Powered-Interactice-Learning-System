"use client";

import React from "react";
import { AlertTriangle, Award, BookOpen, TrendingUp, Users } from "lucide-react";

export function DashboardMetricCards({ model }) {
  const { totals, selectedSection } = model;
  const sectionScope = selectedSection
    ? `Section ${selectedSection.name}`
    : "Grade 6 Cohort";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* 1. Total Students */}
      <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-semibold">Total Students</span>
          <Users className="size-4 text-primary" />
        </div>
        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-display">
            {totals.learnerCount}
          </div>
          <span className="text-[11px] text-muted-foreground mt-1 block">
            {sectionScope}
          </span>
        </div>
      </div>

      {/* 2. Needs Intervention */}
      <div className="bg-card p-5 rounded-2xl border border-destructive/30 bg-destructive/5 shadow-xs flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between text-destructive">
          <span className="text-xs font-bold">Needs Intervention</span>
          <AlertTriangle className="size-4 text-destructive" />
        </div>
        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-destructive font-display">
            {totals.needsSupportCount}
          </div>
          <span className="text-[11px] text-destructive font-medium mt-1 block">
            Action required
          </span>
        </div>
      </div>

      {/* 3. Currently Learning */}
      <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-semibold">Currently Learning</span>
          <BookOpen className="size-4 text-sky-600 dark:text-sky-400" />
        </div>
        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-display">
            {totals.activeCount}
          </div>
          <span className="text-[11px] text-sky-600 dark:text-sky-400 font-medium mt-1 block">
            Active progression
          </span>
        </div>
      </div>

      {/* 4. Doing Well */}
      <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-semibold">Doing Well</span>
          <Award className="size-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 font-display">
            {totals.masteredCount}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 block">
            ≥75% Mastery
          </span>
        </div>
      </div>

      {/* 5. Average Mastery */}
      <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-semibold">Average Mastery</span>
          <TrendingUp className="size-4 text-primary" />
        </div>
        <div className="mt-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-display">
            {totals.averageMasteryFormatted}
          </div>
          <span className="text-[11px] text-muted-foreground font-medium mt-1 block">
            Across competencies
          </span>
        </div>
      </div>
    </div>
  );
}
