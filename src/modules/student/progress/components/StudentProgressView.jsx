"use client";

import React from "react";

import { ProgressMetricCards } from "./ProgressMetricCards.jsx";
import { RecommendedActionBanner } from "./RecommendedActionBanner.jsx";
import { CompetencyMasteryTable } from "./CompetencyMasteryTable.jsx";
import { LearningHistoryTabs } from "./LearningHistoryTabs.jsx";
import { ProgressNoDiagnostic } from "./ProgressStates.jsx";

export function StudentProgressView({ model }) {
  if (!model.hasData && model.diagnosticScore === null) {
    return <ProgressNoDiagnostic />;
  }

  return (
    <div className="min-w-0 space-y-8 max-w-6xl mx-auto pb-16 animate-in fade-in duration-200">
      {/* 1. Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-display tracking-tight">
          My Mathematics Competency Progress
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Detailed record of your diagnostic screening baseline, targeted growth trajectory, and mastery certifications.
        </p>
      </div>

      {/* 2. Top Metric Highlight Cards */}
      <ProgressMetricCards model={model} />

      {/* 3. Recommended Next Action */}
      <RecommendedActionBanner action={model.recommendedAction} />

      {/* 4. Main Competency Data Table */}
      <CompetencyMasteryTable competencies={model.competencies} />

      {/* 5. Trajectory & Learning History Tabs */}
      <LearningHistoryTabs history={model.history} />
    </div>
  );
}
