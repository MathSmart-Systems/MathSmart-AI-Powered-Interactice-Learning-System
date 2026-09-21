import React from "react";

import { STUDENT_ROUTE } from "../utils/dashboard-model";

import { CompetencyProgressList } from "./CompetencyProgressList";
import { DashboardHeader } from "./DashboardHeader";
import { GrowthPlot } from "./GrowthPlot";
import { LearningPathPreview } from "./LearningPathPreview";
import { NextStep } from "./NextStep";
import { ReadyForYou } from "./ReadyForYou";
import { RecentActivityList } from "./RecentActivityList";
import { EmptyNote, Section } from "./Section";
import { StatStrip } from "./StatStrip";
import { SupportNotice } from "./SupportNotice";

/**
 * The learner's dashboard: where they are, and what to do next.
 *
 * Read top to bottom it answers four questions in order — what should I do
 * now, how am I doing, what is open to me, and what have I done — and each
 * number appears once. The version this replaced showed the same growth figure
 * three times and the same scores twice, in two different roundings, across
 * four tiles and the panel beneath them.
 *
 * Nothing on this page is worked out here. Scores, bands, growth, path order,
 * the next step and what is open to sit are all the API's answers; the page
 * chooses which of them to show and in what words.
 */
export function DashboardView({ model, pathUnavailable = false }) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-10">
      <DashboardHeader learner={model.learner} diagnostic={model.diagnostic} />

      <NextStep action={model.nextAction} headingId="next-step-heading" />

      {model.support ? <SupportNotice notice={model.support} /> : null}

      <StatStrip
        plot={model.plot}
        mastery={model.mastery}
        modules={model.modules}
        diagnosticComplete={model.diagnostic.isComplete}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
          <ReadyForYou ready={model.ready} />

          <Section
            id="learning-path-heading"
            title="Your learning path"
            description="Your lessons in the order your diagnostic suggested."
            link={{ href: STUDENT_ROUTE.MY_LEARNING, label: "Open My Learning" }}
          >
            {pathUnavailable ? (
              <EmptyNote>
                Your learning path could not be loaded just now. Everything else on this page is
                up to date. Reload the page to try again.
              </EmptyNote>
            ) : model.path.isEmpty ? (
              <EmptyNote>
                {model.diagnostic.isComplete
                  ? "Your path is being prepared from your diagnostic. It will appear here when it is ready."
                  : "Your path is built from your diagnostic. Finish the diagnostic and your lessons will appear here."}
              </EmptyNote>
            ) : (
              <div className="flex flex-col gap-2">
                <LearningPathPreview items={model.path.preview} />
                {model.path.remaining > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {model.path.remaining} more{" "}
                    {model.path.remaining === 1 ? "lesson is" : "lessons are"} on your path.
                  </p>
                ) : null}
              </div>
            )}
          </Section>

          <Section
            id="competency-heading"
            title="Competency progress"
            description="Where you stand on each topic you have worked on."
            link={{ href: STUDENT_ROUTE.PROGRESS, label: "See full progress" }}
          >
            {model.competencies.isEmpty ? (
              <EmptyNote>
                No scores yet. They appear here once your first assessment is marked.
              </EmptyNote>
            ) : (
              <div className="flex flex-col gap-2">
                <CompetencyProgressList competencies={model.competencies.preview} />
                {model.competencies.remaining > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {model.competencies.remaining} more on your progress page.
                  </p>
                ) : null}
              </div>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Section
            id="growth-heading"
            title="How you are improving"
            description={
              model.plot.diagnosticScore === null
                ? "Your first point appears here once your diagnostic is marked."
                : "Your diagnostic is the first point. Everything you finish moves the second."
            }
          >
            <GrowthPlot
              diagnosticScore={model.plot.diagnosticScore}
              currentScore={model.plot.currentScore}
              growthValue={model.plot.growthValue}
              growth={model.plot.growth}
            />
          </Section>

          <Section
            id="recent-activity-heading"
            title="Recently finished"
            description="Your marked work, newest first."
            link={{ href: STUDENT_ROUTE.ACTIVITIES, label: "All activities" }}
          >
            {model.activity.isEmpty ? (
              <EmptyNote>
                Nothing marked yet. Your first finished activity or assessment will show here.
              </EmptyNote>
            ) : (
              <RecentActivityList activity={model.activity.preview} />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
