"use client";

import React from "react";
import { Award, BookOpen, TrendingUp } from "lucide-react";

const HEADING_IDS = {
  overall: "progress-metric-overall-heading",
  modules: "progress-metric-modules-heading",
  competencies: "progress-metric-competencies-heading",
};

function plural(count, singular, pluralForm) {
  return count === 1 ? singular : pluralForm;
}

/**
 * A bar that reports the same number it draws.
 *
 * The bars were bare `div`s whose width was the only thing that carried the
 * value, so a screen reader was handed a percentage in the heading area and
 * then an unlabelled box. Declaring the real range here lets the bar be read,
 * and `aria-valuetext` gives it the same sentence the sighted learner reads
 * under the number rather than a naked "45".
 */
function MeterBar({ value, labelledBy, valueText }) {
  const clamped = Math.min(100, Math.max(0, Math.round(value) || 0));

  return (
    <div
      role="progressbar"
      aria-labelledby={labelledBy}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={valueText}
      className="h-2 w-full bg-muted rounded-full overflow-hidden"
    >
      <div
        className="h-full bg-primary rounded-full transition-all duration-500 motion-reduce:transition-none"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

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
    masteryDenominator,
    masteryDenominatorSource,
    allCompetenciesMastered,
    attemptedCompetencies,
    masteryPercent,
  } = model;

  const isPositiveGrowth = growth !== null && growth > 0;
  const isNegativeGrowth = growth !== null && growth < 0;

  /*
   * Every denominator on this row is named in words. "3 / 6" on its own left a
   * learner to guess whether six was the whole of Grade 6, the lessons they had
   * been given, or the ones they had opened, and the three cards were not even
   * counting the same kind of thing as each other.
   */
  const overallCaption =
    attemptedCompetencies > 0
      ? `Average of your latest score in each of the ${attemptedCompetencies} ${plural(
          attemptedCompetencies,
          "competency",
          "competencies",
        )} you have worked on`
      : "You have no competency scores yet, so there is nothing to average";

  const modulesCaption =
    totalModules > 0
      ? `Finished out of the ${totalModules} ${plural(
          totalModules,
          "lesson",
          "lessons",
        )} on your own learning path, not every Grade 6 lesson`
      : "No lessons are on your learning path yet, so there is nothing to count against";

  const masteryCaption =
    masteryDenominatorSource === "published"
      ? `Mastered out of the ${masteryDenominator} Grade 6 ${plural(
          masteryDenominator,
          "competency",
          "competencies",
        )} in the curriculum`
      : `Mastered out of the ${masteryDenominator} ${plural(
          masteryDenominator,
          "competency",
          "competencies",
        )} you have worked on. The full Grade 6 list is not available right now, so this is not your whole curriculum.`;

  return (
    <section aria-labelledby="progress-metrics-heading" className="space-y-4">
      <h2
        id="progress-metrics-heading"
        className="text-lg font-bold text-foreground font-display"
      >
        Your progress at a glance
      </h2>

      {/*
        `items-start` keeps each card as tall as its own content. The cards were
        stretched to the tallest one in the row and pushed their bars apart with
        `justify-between`, which opened a band of empty card under the shorter
        two.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-start">
        {/* 1. Overall Progress / Mastery */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3
                id={HEADING_IDS.overall}
                className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
              >
                Overall Progress
              </h3>
              <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                <TrendingUp className="w-5 h-5" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-2">
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
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {overallCaption}
            </p>
          </div>
          <MeterBar
            value={overallMastery || 0}
            labelledBy={HEADING_IDS.overall}
            valueText={`${overallMasteryFormatted} average score`}
          />
        </div>

        {/* 2. Modules Completed */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3
                id={HEADING_IDS.modules}
                className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
              >
                Modules Completed
              </h3>
              <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                <BookOpen className="w-5 h-5" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-2">
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
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {modulesCaption}
            </p>
          </div>
          <MeterBar
            value={moduleCompletionPercent}
            labelledBy={HEADING_IDS.modules}
            valueText={`${modulesCompleted} of ${totalModules} finished`}
          />
        </div>

        {/* 3. Competencies Mastered */}
        <div className="bg-card p-6 rounded-2xl border border-border shadow-xs flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3
                id={HEADING_IDS.competencies}
                className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
              >
                Competencies Mastered
              </h3>
              <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                <Award className="w-5 h-5" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold text-foreground font-display">
                {masteredCount}{" "}
                <span className="text-lg font-bold text-muted-foreground">
                  / {masteryDenominator}
                </span>
              </span>
              {/*
                Only the complete published curriculum total can support this
                sentence, and `allCompetenciesMastered` is the model's guard for
                exactly that. It used to appear whenever the mastered count
                matched the rows the learner had attempted, so passing two
                competencies announced that Grade 6 was finished.
              */}
              {allCompetenciesMastered ? (
                <span className="text-xs text-primary font-semibold">
                  All Grade 6 competencies mastered
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {masteryCaption}
            </p>
          </div>
          <MeterBar
            value={masteryPercent}
            labelledBy={HEADING_IDS.competencies}
            valueText={`${masteredCount} of ${masteryDenominator} mastered`}
          />
        </div>
      </div>
    </section>
  );
}
