"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Sparkles,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStudentFeedback } from "../services/diagnostic-service";
import { buildAssessmentFeedbackContext } from "../services/diagnostic-feedback";
import { styleForBand } from "../utils/format";
import { readInsight, writeInsight } from "../utils/insight-cache";

import { AnswerReview } from "./AnswerReview";
import { FeedbackMarkdown } from "./FeedbackMarkdown";

export function DiagnosticResultsView({
  result,
  assessmentTitle = "",
  autoSubmitted = false,
  showReview = false,
  onShowReviewChange,
}) {
  const [feedback, setFeedback] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [feedbackUnavailable, setFeedbackUnavailable] = useState(false);
  const [focusedCompetency, setFocusedCompetency] = useState(null);

  const gaps = useMemo(
    () => result?.domain_scores?.filter((entry) => entry.gap_identified) ?? [],
    [result?.domain_scores],
  );
  const primaryActionHref =
    result?.next_action?.type === "dashboard"
      ? "/student/dashboard"
      : "/student/my-learning";

  // Written once per attempt and then reused.
  //
  // This used to run again on every mount and on every competency a learner
  // clicked, so the same finished paper produced different advice each time
  // it was opened — which makes a deterministic result look unsettled. It now
  // depends on the attempt alone, and reads back what was already written
  // before asking for anything.
  //
  // The competency a learner clicks no longer shapes it either. That made the
  // summary rewrite itself as they explored the table, which is the same
  // unsettled feeling by another route; highlighting a row is now only that.
  const attemptId = result?.attempt_id ?? null;

  useEffect(() => {
    if (!result) return undefined;

    let cancelled = false;

    const dominantBand =
      gaps.length === 0
        ? "Mastered"
        : gaps[0]?.mastery_band ?? "Needs Improvement";

    const context = buildAssessmentFeedbackContext({
      assessmentTitle,
      percentage: result.percentage,
      totalScore: result.total_score,
      maxScore: result.max_score,
      domainScores: result.domain_scores,
    });

    // The remembered answer travels the same path as a fresh one, so every
    // state change still happens in a callback. Setting state straight from
    // the effect body is what React asks callers not to do.
    const remembered = readInsight(attemptId);
    const pending = remembered
      ? Promise.resolve(remembered)
      : getStudentFeedback({
          score: result.percentage,
          masteryBand: dominantBand,
          displayContext: context,
        }).then((res) => {
          if (res?.feedback_text) writeInsight(attemptId, res);
          return res;
        });

    pending
      .then((res) => {
        if (cancelled) return;
        if (res?.feedback_text) {
          setFeedback(res);
          setFeedbackUnavailable(false);
        } else {
          setFeedbackUnavailable(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFeedbackUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setFeedbackLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attemptId, assessmentTitle, gaps, result]);

  if (!result) return null;

  return (
    <section className="flex flex-col gap-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2.5">
          <Link href="/student/assessments">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to assessments
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <BarChart3 aria-hidden="true" className="size-4 text-primary" />
          Diagnostic gap report
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Here&apos;s your starting point.
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        {autoSubmitted && (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Timer aria-hidden="true" className="size-4" />
            Time ran out, so your assessment submitted automatically.
          </p>
        )}
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <Card>
          <CardContent className="flex h-full flex-col justify-center gap-1 py-8 text-center">
            <p className="text-sm text-muted-foreground">Raw score</p>
            <p className="font-mono text-5xl font-semibold tabular-nums text-foreground">
              {result.total_score ?? "\u2014"}
              <span className="text-2xl text-muted-foreground">
                /{result.max_score ?? "\u2014"}
              </span>
            </p>
            <p className="text-lg font-semibold text-primary">
              {result.percentage}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-3">
            <CardDescription className="flex items-center gap-2">
              <Award aria-hidden="true" className="size-4" />
              Competencies assessed
            </CardDescription>
            <CardTitle as="h2" className="text-xl font-semibold">
              {result.domain_scores.length - gaps.length} of{" "}
              {result.domain_scores.length} mastered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {gaps.length === 0
                ? "Every competency cleared. Enrichment work is unlocked."
                : `${gaps.length} ${gaps.length === 1 ? "competency needs" : "competencies need"} targeted practice before you move ahead.`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.03] shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Sparkles aria-hidden="true" className="size-4" />
            </span>
            <div>
              <CardTitle as="h2" className="text-base font-semibold text-foreground">
                Personalized Learning Insights
              </CardTitle>
              <CardDescription className="text-xs">
                Advisory summary to guide your next learning steps
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {focusedCompetency && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 text-xs cursor-pointer hover:bg-secondary/80"
                onClick={() => setFocusedCompetency(null)}
                title="Click to clear competency focus"
              >
                <span>Focus: {focusedCompetency}</span>
                <span aria-hidden="true" className="font-bold">×</span>
              </Badge>
            )}
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/5 text-xs font-normal text-primary"
            >
              Advisory
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-1">
          {feedbackLoading ? (
            <div
              className="flex flex-col gap-2 py-2"
              role="status"
              aria-label="Generating learning insights"
            >
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <p className="mt-1 animate-pulse text-xs text-muted-foreground">
                Writing your summary…
              </p>
            </div>
          ) : feedback?.feedback_text ? (
            <div className="flex flex-col gap-3">
              <FeedbackMarkdown content={feedback.feedback_text} />
              {/* No provider name, no model identifier. Naming the vendor and
                  its model to a Grade 6 learner tells them nothing they can
                  act on and puts deployment configuration on a page a child
                  reads. The panel is already headed "Personalized Learning
                  Insights" and badged "Advisory", which is the part that
                  matters: this is a suggestion, and the scores above are not.
                  Sample text still says so, because a canned sentence must
                  never pass for a real one. */}
              {feedback.provider === "mock" ? (
                <p className="border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
                  Sample text for local development — not AI output
                </p>
              ) : null}
            </div>
          ) : (
            <p className="py-1 text-xs text-muted-foreground">
              AI assistance is currently unavailable. Your official scores and
              competency breakdown below are complete.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base font-semibold">
            Performance by competency
          </CardTitle>
          <CardDescription>
            Where the score came from, strand by strand.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {result.domain_scores.map((entry) => {
            const isFocused = focusedCompetency === entry.domain;
            return (
              <div
                key={entry.competency_id ?? entry.domain}
                className={`flex flex-col gap-2 rounded-lg p-2.5 transition-colors ${
                  isFocused
                    ? "bg-primary/5 ring-1 ring-primary/40 shadow-xs"
                    : "hover:bg-muted/40"
                }`}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <button
                    type="button"
                    onClick={() =>
                      setFocusedCompetency((prev) =>
                        prev === entry.domain ? null : entry.domain
                      )
                    }
                    className="text-left text-sm font-medium text-foreground hover:text-primary transition-colors cursor-pointer"
                    title={
                      isFocused
                        ? "Click to clear focus"
                        : `Click to focus AI insights on ${entry.domain}`
                    }
                  >
                    {entry.domain}
                    {isFocused && (
                      <span className="ml-2 text-xs font-normal text-primary">
                        (Focus active)
                      </span>
                    )}
                  </button>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {entry.score != null && entry.max_score != null
                      ? `${entry.score}/${entry.max_score} · ${entry.percentage}%`
                      : `${entry.percentage}%`}
                  </span>
                </div>

                <div
                  role="progressbar"
                  aria-valuenow={entry.percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${entry.domain} mastery`}
                  className="h-2 overflow-hidden rounded-full bg-secondary"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-700 ease-out ${styleForBand(entry.mastery_band).bar}`}
                    style={{ width: `${entry.percentage}%` }}
                  />
                </div>

                {entry.mastery_band && (
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        setFocusedCompetency((prev) =>
                          prev === entry.domain ? null : entry.domain
                        )
                      }
                      className="text-[11px] text-muted-foreground hover:text-primary transition-colors cursor-pointer underline-offset-2 hover:underline"
                    >
                      {isFocused ? "Clear focus" : "Focus AI insights"}
                    </button>
                    <Badge
                      variant="outline"
                      className={styleForBand(entry.mastery_band).badge}
                    >
                      {entry.mastery_band}
                    </Badge>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2 text-base font-semibold">
            <AlertCircle aria-hidden="true" className="size-4 text-destructive" />
            Identified learning gaps
          </CardTitle>
          <CardDescription>
            {gaps.length === 0
              ? "Nothing flagged."
              : `${gaps.length} ${gaps.length === 1 ? "competency" : "competencies"} to rebuild first.`}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {gaps.length === 0 ? (
            <p className="flex items-center gap-3 border-l-[3px] border-primary bg-primary/5 px-4 py-4 text-sm text-foreground">
              <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-primary" />
              Every competency cleared. Enrichment modules are unlocked.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {gaps.map((gap) => (
                <li
                  key={gap.competency_id ?? gap.domain}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{gap.domain}</p>
                    <p className="text-xs text-muted-foreground">
                      {gap.mastery_band ?? "Assessed"}
                    </p>
                  </div>
                  <Badge variant="outline" className={styleForBand(gap.mastery_band).badge}>
                    {gap.score != null && gap.max_score != null
                      ? `${gap.score}/${gap.max_score}`
                      : "\u2014"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>

        <CardFooter className="flex flex-col items-stretch gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <Button asChild size="lg">
            <Link href={primaryActionHref}>
              <Sparkles aria-hidden="true" />
              {result.next_action?.label ?? "Start recommended modules"}
            </Link>
          </Button>
          {/* Offered whenever there is a closed attempt to read, not only
              while the player still holds the questions in memory. Opening a
              report from the history list days later used to hide this. */}
          {result?.attempt_id && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => onShowReviewChange?.(true)}
              aria-haspopup="dialog"
            >
              <BookOpen aria-hidden="true" />
              Review my answers
            </Button>
          )}
          <Button asChild variant="ghost" size="lg" className="sm:ml-auto">
            <Link href="/student/dashboard">Back to dashboard</Link>
          </Button>
        </CardFooter>
      </Card>

      <AnswerReview
        attemptId={result?.attempt_id}
        open={showReview}
        onOpenChange={onShowReviewChange}
      />

    </section>
  );
}
