"use client";

import React from "react";
import { TriangleAlert } from "lucide-react";

import { ProgressMetricCards } from "./ProgressMetricCards.jsx";
import { RecommendedActionBanner } from "./RecommendedActionBanner.jsx";
import { CompetencyMasteryTable } from "./CompetencyMasteryTable.jsx";
import { LearningHistoryTabs } from "./LearningHistoryTabs.jsx";
import { ProgressNoDiagnostic } from "./ProgressStates.jsx";

/**
 * @param {object} props
 * @param {object} props.model the normalized progress presentation model
 * @param {boolean} [props.pathUnavailable] true when the learning-path read failed
 */
export function StudentProgressView({ model, pathUnavailable = false }) {
  if (!model.hasData && model.diagnosticScore === null) {
    return <ProgressNoDiagnostic />;
  }

  return (
    <div className="min-w-0 space-y-8 max-w-6xl mx-auto pb-16 animate-in fade-in duration-200 motion-reduce:animate-none">
      {/* 1. Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground font-display tracking-tight">
          My Mathematics Competency Progress
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Detailed record of your diagnostic screening baseline, targeted growth
          trajectory, and mastery certifications.
        </p>
      </div>

      {/*
        A partial failure, said out loud. The learning path feeds the module
        count and the recommended next step, so when it does not load those two
        are standing on less than they normally do. The dashboard and My
        Learning both say so; this page silently dropped the flag, which made
        the same outage invisible on the one screen that is meant to be an
        honest record.
      */}
      {pathUnavailable ? (
        <p className="flex items-start gap-2.5 border-l-[3px] border-destructive bg-destructive/5 px-5 py-4 text-xs leading-relaxed text-foreground">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-destructive mt-0.5" />
          <span>
            Your learning path could not be loaded just now, so the module count
            and your recommended next step may be out of date. Everything else on
            this page comes from your own records. Try again in a moment.
          </span>
        </p>
      ) : null}

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
