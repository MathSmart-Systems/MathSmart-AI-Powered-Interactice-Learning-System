"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  RefreshCw,
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
import { QUESTION_TYPE, getStudentFeedback } from "../services/diagnostic-service";
import { buildAssessmentFeedbackContext } from "../services/diagnostic-feedback";
import { LETTERS, hasAnswer, styleForBand } from "../utils/format";
import { FeedbackMarkdown } from "./FeedbackMarkdown";

export function DiagnosticResultsView({
  result,
  assessmentTitle = "",
  autoSubmitted = false,
  questions = [],
  answers = {},
  showReview = false,
  onToggleReview,
}) {
  const [feedback, setFeedback] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [feedbackUnavailable, setFeedbackUnavailable] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [focusedCompetency, setFocusedCompetency] = useState(null);

  const gaps = useMemo(
    () => result?.domain_scores?.filter((entry) => entry.gap_identified) ?? [],
    [result?.domain_scores],
  );
  const primaryActionHref =
    result?.next_action?.type === "dashboard"
      ? "/student/dashboard"
      : "/student/my-learning";

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
      focusedCompetency,
    });

    getStudentFeedback({
      score: result.percentage,
      masteryBand: dominantBand,
      displayContext: context,
    })
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
  }, [result, assessmentTitle, focusedCompetency, gaps, retryCount]);

  const handleRetry = useCallback(() => {
    setFeedbackLoading(true);
    setFeedbackUnavailable(false);
    setRetryCount((prev) => prev + 1);
  }, []);

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
            <CardTitle className="text-xl font-semibold">
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
              <CardTitle className="text-base font-semibold text-foreground">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRetry}
              disabled={feedbackLoading}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              title="Regenerate advisory feedback"
            >
              <RefreshCw
                aria-hidden="true"
                className={`mr-1 size-3 ${feedbackLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
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
              <p className="mt-1 text-xs text-muted-foreground animate-pulse">
                Consulting Groq AI for learning recommendations...
              </p>
            </div>
          ) : feedback?.feedback_text ? (
            <div className="flex flex-col gap-3">
              <FeedbackMarkdown content={feedback.feedback_text} />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
                <span>
                  Advisory insight powered by Groq
                  {feedback.model ? ` (${feedback.model})` : ""}
                </span>
                <span>
                  Deterministic scoring &amp; progression are never decided by AI
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 py-1">
              <p className="text-xs text-muted-foreground">
                AI assistance is currently unavailable. Your official scores and
                competency breakdown below are complete.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRetry}
                className="h-7 shrink-0 px-2.5 text-xs"
              >
                <RefreshCw aria-hidden="true" className="mr-1.5 size-3" />
                Retry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
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
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
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
          {questions.length > 0 && (
            <Button
              variant="outline"
              size="lg"
              onClick={onToggleReview}
              aria-expanded={showReview}
            >
              <BookOpen aria-hidden="true" />
              {showReview ? "Hide my answers" : "Review my answers"}
            </Button>
          )}
          <Button asChild variant="ghost" size="lg" className="sm:ml-auto">
            <Link href="/student/dashboard">Back to dashboard</Link>
          </Button>
        </CardFooter>
      </Card>

      {showReview && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Answer review</h2>
            <p className="text-xs text-muted-foreground">
              Review your submitted responses for each question below.
            </p>
          </div>
          <ol className="flex flex-col gap-4">
            {questions.map((question) => {
              const picked = answers[question.id];

              return (
                <li key={question.id} className="border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Q{question.number} · {question.domain}
                      </p>
                      <p className="max-w-prose text-base leading-snug text-foreground">
                        {question.prompt}
                      </p>
                    </div>
                    <Badge
                      variant={hasAnswer(picked) ? "secondary" : "outline"}
                      className={
                        hasAnswer(picked)
                          ? "text-xs font-normal"
                          : "border-destructive/40 text-xs font-normal text-destructive"
                      }
                    >
                      {hasAnswer(picked) ? "Answer recorded" : "Unanswered"}
                    </Badge>
                  </div>

                  {question.type === QUESTION_TYPE.MULTIPLE_CHOICE ? (
                    <ul className="mt-4 flex flex-col gap-2">
                      {(question.options ?? []).map((option, optionIndex) => {
                        const isPicked = picked === option.key;

                        return (
                          <li
                            key={option.key}
                            className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                              isPicked
                                ? "border-primary/40 bg-primary/5 text-foreground"
                                : "border-border text-muted-foreground"
                            }`}
                          >
                            <span className="font-mono text-xs text-muted-foreground">
                              {LETTERS[optionIndex] ?? optionIndex + 1}
                            </span>
                            <span className="leading-relaxed">{option.label}</span>
                            {isPicked && (
                              <span className="ml-auto shrink-0 text-xs font-medium text-primary">
                                Your answer
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : hasAnswer(picked) ? (
                    <p className="mt-4 rounded-md border border-primary/40 bg-primary/5 px-3 py-3 text-sm text-foreground">
                      <span className="text-xs font-medium text-primary">Your answer</span>
                      <span className="mt-1 block leading-relaxed">{picked || "Blank"}</span>
                    </p>
                  ) : null}

                  {!hasAnswer(picked) && (
                    <p className="mt-3 text-xs text-destructive">
                      Left blank during the assessment.
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
