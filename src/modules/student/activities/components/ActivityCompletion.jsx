"use client";

import Link from "next/link";
import { ArrowRight, RotateCcw, Sparkles, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";

import { formatPercent } from "../utils/format.js";

/**
 * The finished activity report.
 *
 * Score, accuracy, pass decision, mastery band and competency growth are all
 * deterministic outputs the API computed. The AI encouragement at the bottom,
 * when present, is advisory and clearly labelled as a suggestion.
 */
export function ActivityCompletion({
  outcome,
  encouragement = null,
  encouragementLoading = false,
  onTryAgain,
}) {
  if (!outcome) return null;

  const passed = outcome.passed;
  const showGrowth =
    outcome.previousCompetencyScore !== null || outcome.currentCompetencyScore !== null;

  const primary = outcome.nextAction;
  const isContinue = primary?.type === "dashboard";

  return (
    <section className="flex flex-col gap-8" aria-labelledby="completion-heading">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">Activity finished</p>
        <h1 id="completion-heading" className="font-display text-3xl font-semibold tracking-tight text-foreground">
          {passed ? "Nicely done!" : "Good effort — keep going."}
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {passed
            ? "You reached the pass goal for this practice activity."
            : "You did not reach the pass goal this time. Practice again and your next attempt counts."}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="border border-border bg-card px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Activity score
          </p>
          <p className="mt-1 font-display text-3xl font-semibold text-foreground">
            {outcome.score ?? "–"}
            <span className="text-lg text-muted-foreground"> / {outcome.maxScore ?? "–"}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {outcome.attemptNumber > 1
              ? `Attempt ${outcome.attemptNumber}`
              : "First attempt"}
          </p>
        </div>

        <div className="border border-border bg-card px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Accuracy
          </p>
          <p className="mt-1 font-display text-3xl font-semibold text-foreground">
            {formatPercent(outcome.accuracy) ?? "–"}
          </p>
          <p className="mt-1 text-sm">{outcome.masteryLabel}</p>
        </div>
      </div>

      {showGrowth && (
        <section aria-labelledby="growth-heading" className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <TrendingUp aria-hidden="true" className="size-4 text-primary" />
            <h2 id="growth-heading" className="font-display text-xl font-semibold text-foreground">
              Competency progress
            </h2>
          </div>
          <div className="flex items-center justify-between gap-6 border border-border bg-card px-5 py-5">
            <div>
              <p className="text-xs text-muted-foreground">Before this activity</p>
              <p className="font-mono-math text-xl font-semibold text-foreground">
                {formatPercent(outcome.previousCompetencyScore) ?? "Not scored"}
              </p>
            </div>
            <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Now</p>
              <p className="font-mono-math text-xl font-semibold text-primary">
                {formatPercent(outcome.currentCompetencyScore) ?? "Not scored"}
              </p>
            </div>
          </div>
        </section>
      )}

      {outcome.interventionCreated && (
        <div className="border-l-[3px] border-primary bg-secondary/50 px-5 py-4">
          <p className="text-sm leading-relaxed text-foreground">
            Your teacher has been told that this competency would benefit from
            some extra help. That is a normal part of learning — just keep
            working through your path.
          </p>
        </div>
      )}

      {(encouragement !== null || encouragementLoading) && (
        <div className="flex items-start gap-3 border border-border bg-card px-5 py-5">
          <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              AI encouragement
            </p>
            {encouragementLoading ? (
              <p className="text-sm italic text-muted-foreground animate-pulse">
                Coming up with a few words of encouragement…
              </p>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-foreground">{encouragement.text}</p>
                <p className="text-xs text-muted-foreground">
                  Optional help, not a grade.{" "}
                  {encouragement.provider && `Generated by MathSmart AI (${encouragement.model ?? "model"}).`}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
        {isContinue ? (
          <Button asChild size="lg">
            <Link href="/student/dashboard">
              {primary?.label ?? "Continue Learning"}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button size="lg" onClick={onTryAgain}>
            <RotateCcw aria-hidden="true" />
            {primary?.label ?? "Try the Activity Again"}
          </Button>
        )}
        <Button asChild variant="outline" size="lg">
          <Link href="/student/activities">Back to Activities</Link>
        </Button>
      </div>
    </section>
  );
}