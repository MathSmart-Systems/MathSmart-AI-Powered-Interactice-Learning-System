import React from "react";
import { Award, BookOpen, FileCheck2, TrendingUp } from "lucide-react";

import { STUDENT_ROUTE } from "../utils/dashboard-model";

import { CompetencyProgressList } from "./CompetencyProgressList";
import { DashboardHeader } from "./DashboardHeader";
import { GrowthPlot } from "./GrowthPlot";
import { LearningPathPreview } from "./LearningPathPreview";
import { ModuleCompletion } from "./ModuleCompletion";
import { NextStep } from "./NextStep";
import { RecentActivityList } from "./RecentActivityList";
import { EmptyNote, Section } from "./Section";
import { SupportNotice } from "./SupportNotice";

/**
 * The learner dashboard conforming to the MathSmart UI/UX reference.
 *
 * Provides:
 * 1. Welcome Header banner with ARAL badge and diagnostic status.
 * 2. Dominant Next Action Hero Card with gradient surface and clear CTA.
 * 3. Learning Metrics Grid (4 high-level KPI cards).
 * 4. Two-Column Layout:
 *    - Left 2 cols (lg:col-span-2): Growth plot & module completion, learning path roadmap, competency progress.
 *    - Right 1 col (lg:col-span-1): Recent activity list and teacher guidance support note.
 */
export function DashboardView({ model, pathUnavailable = false }) {
  const currentScoreText =
    model.plot.currentScore !== null ? `${model.plot.currentScore}%` : "—";
  const diagnosticScoreText =
    model.plot.diagnosticScore !== null ? `${model.plot.diagnosticScore}%` : model.diagnostic.label;
  const growthVal = model.plot.growthValue;
  const growthScoreText =
    growthVal !== null && growthVal !== undefined
      ? growthVal > 0
        ? `+${growthVal}%`
        : `${growthVal}%`
      : "—";

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* 1. Welcome Banner */}
      <DashboardHeader learner={model.learner} diagnostic={model.diagnostic} />

      {/* 2. Dominant Next Step Action Card */}
      <NextStep action={model.nextAction} headingId="next-step-heading" />

      {/* 3. Learning Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Overall Progress */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Overall Progress</span>
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <TrendingUp className="size-4" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-foreground font-display">
                {currentScoreText}
              </span>
              {model.plot.growth?.text ? (
                <span className="text-xs font-semibold text-primary">{model.plot.growth.text}</span>
              ) : null}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Weighted competency mastery</p>
        </div>

        {/* Metric 2: Diagnostic Baseline */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Diagnostic Baseline</span>
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <FileCheck2 className="size-4" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-foreground font-display">
                {diagnosticScoreText}
              </span>
              <span className="text-xs text-primary font-semibold">
                {model.diagnostic.label === "Completed" ? "Evaluated" : "Initial screening"}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 truncate">
            {model.diagnostic.summary}
          </p>
        </div>

        {/* Metric 3: Score Trajectory */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Score Trajectory</span>
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Award className="size-4" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-foreground font-display">
                {growthScoreText}
              </span>
              <span className="text-xs text-muted-foreground font-medium">overall growth</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Growth across completed activities</p>
        </div>

        {/* Metric 4: Modules Completed */}
        <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Modules Completed</span>
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <BookOpen className="size-4" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-foreground font-display">
                {model.modules.finished}
              </span>
              <span className="text-xs text-muted-foreground">of {model.modules.total}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {model.modules.percent}% of Grade 6 path completed
          </p>
        </div>
      </div>

      {/* 4. Two-Column Layout: Learning Journey & Progress / Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Columns: Growth Plot, Learning Path, Competencies */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section: How you are improving */}
          <Section
            id="growth-heading"
            title="How you are improving"
            description={
              model.plot.diagnosticScore === null
                ? "Your first point goes on this plot as soon as your diagnostic is marked."
                : "Your diagnostic plotted the first point. Everything you finish moves the second one."
            }
            link={{ href: STUDENT_ROUTE.PROGRESS, label: "See full progress" }}
          >
            <div className="flex flex-col gap-6 pt-2">
              <GrowthPlot
                diagnosticScore={model.plot.diagnosticScore}
                currentScore={model.plot.currentScore}
                growthValue={model.plot.growthValue}
                growth={model.plot.growth}
              />

              <div className="border-t border-border/80 pt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Module completion
                </h3>
                <div className="mt-3">
                  <ModuleCompletion
                    finished={model.modules.finished}
                    total={model.modules.total}
                    percent={model.modules.percent}
                  />
                </div>
              </div>
            </div>
          </Section>

          {/* Section: Your learning path */}
          <Section
            id="learning-path-heading"
            title="Your learning path"
            description="The order MathSmart recommends, built from what your diagnostic found."
            link={{ href: STUDENT_ROUTE.MY_LEARNING, label: "Open My Learning" }}
          >
            {pathUnavailable ? (
              <EmptyNote>
                Your learning path could not be loaded just now. Everything else on this page
                is up to date. Reload the page to try again.
              </EmptyNote>
            ) : model.path.isEmpty ? (
              <EmptyNote>
                No modules are on your path yet. Your teacher builds it from your diagnostic
                and the Grade 6 competencies, and it will appear here as soon as it is ready.
              </EmptyNote>
            ) : (
              <div className="space-y-3 pt-1">
                <LearningPathPreview items={model.path.preview} />
                {model.path.remaining > 0 ? (
                  <p className="text-xs text-muted-foreground pt-1">
                    {model.path.remaining} more{" "}
                    {model.path.remaining === 1 ? "step is" : "steps are"} on your path.
                  </p>
                ) : null}
              </div>
            )}
          </Section>

          {/* Section: Competency progress */}
          <Section
            id="competency-heading"
            title="Competency progress"
            description="Where you stand on each Grade 6 competency MathSmart is tracking for you."
            link={{ href: STUDENT_ROUTE.ASSESSMENTS, label: "Go to assessments" }}
          >
            {model.competencies.isEmpty ? (
              <EmptyNote>
                No competency scores have been recorded yet. They appear here once your first
                assessment is marked.
              </EmptyNote>
            ) : (
              <div className="space-y-3 pt-1">
                <CompetencyProgressList competencies={model.competencies.preview} />
                {model.competencies.remaining > 0 ? (
                  <p className="text-xs text-muted-foreground pt-1">
                    {model.competencies.remaining} more{" "}
                    {model.competencies.remaining === 1 ? "competency is" : "competencies are"}{" "}
                    tracked on your progress page.
                  </p>
                ) : null}
              </div>
            )}
          </Section>
        </div>

        {/* Right 1 Column: Recently finished & Teacher Guidance */}
        <div className="space-y-6">
          {/* Section: Recently finished */}
          <Section
            id="recent-activity-heading"
            title="Recently finished"
            description="The work MathSmart has marked for you, newest first."
            link={{ href: STUDENT_ROUTE.ACTIVITIES, label: "All activities" }}
          >
            {model.activity.isEmpty ? (
              <EmptyNote>
                Nothing has been marked yet. Your first finished activity or assessment will be
                listed here with its score.
              </EmptyNote>
            ) : (
              <div className="pt-1">
                <RecentActivityList activity={model.activity.preview} />
              </div>
            )}
          </Section>

          {/* Teacher Guidance / Support Notice */}
          {model.support ? <SupportNotice notice={model.support} /> : null}
        </div>
      </div>
    </div>
  );
}
