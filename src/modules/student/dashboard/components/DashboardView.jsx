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
 * The learner dashboard.
 *
 * It answers three questions in the order a learner asks them: what do I do
 * next, how am I improving, and what have I finished. Everything shown is a
 * value the MathSmart API decided; this component chooses order and wording.
 */
export function DashboardView({ model, pathUnavailable = false }) {
  return (
    <div className="flex flex-col gap-12">
      <DashboardHeader learner={model.learner} diagnostic={model.diagnostic} />

      {model.support ? <SupportNotice notice={model.support} /> : null}

      <NextStep action={model.nextAction} headingId="next-step-heading" />

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
        <div className="flex flex-col gap-6 border border-border bg-card px-5 py-6 sm:px-6">
          <GrowthPlot
            diagnosticScore={model.plot.diagnosticScore}
            currentScore={model.plot.currentScore}
            growthValue={model.plot.growthValue}
            growth={model.plot.growth}
          />

          <div className="border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-foreground">Module completion</h3>
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
          <>
            <LearningPathPreview items={model.path.preview} />
            {model.path.remaining > 0 ? (
              <p className="text-sm text-muted-foreground">
                {model.path.remaining} more{" "}
                {model.path.remaining === 1 ? "step is" : "steps are"} on your path.
              </p>
            ) : null}
          </>
        )}
      </Section>

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
          <>
            <CompetencyProgressList competencies={model.competencies.preview} />
            {model.competencies.remaining > 0 ? (
              <p className="text-sm text-muted-foreground">
                {model.competencies.remaining} more{" "}
                {model.competencies.remaining === 1 ? "competency is" : "competencies are"}{" "}
                tracked on your progress page.
              </p>
            ) : null}
          </>
        )}
      </Section>

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
          <RecentActivityList activity={model.activity.preview} />
        )}
      </Section>
    </div>
  );
}
