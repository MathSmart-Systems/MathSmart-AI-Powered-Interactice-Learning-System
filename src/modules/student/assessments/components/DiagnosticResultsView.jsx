"use client";

import Link from "next/link";
import {
  AlertCircle,
  Award,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  Sparkles,
  Timer,
  X,
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
import { QUESTION_TYPE } from "../services/diagnostic-service";
import { LETTERS, hasAnswer, styleForBand } from "../utils/format";

export function DiagnosticResultsView({
  result,
  autoSubmitted = false,
  questions = [],
  answers = {},
  showReview = false,
  onToggleReview,
}) {
  if (!result) return null;

  const gaps = result.domain_scores?.filter((entry) => entry.gap_identified) ?? [];
  const primaryActionHref =
    result.next_action?.type === "dashboard"
      ? "/student/dashboard"
      : "/student/my-learning";

  return (
    <section className="flex flex-col gap-8">
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
              {result.total_score}
              <span className="text-2xl text-muted-foreground">
                /{result.max_score}
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
          {result.domain_scores.map((entry) => (
            <div key={entry.competency_id ?? entry.domain} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium text-foreground">
                  {entry.domain}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {entry.score}/{entry.max_score} · {entry.percentage}%
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
                <div className="flex justify-end">
                  <Badge
                    variant="outline"
                    className={styleForBand(entry.mastery_band).badge}
                  >
                    {entry.mastery_band}
                  </Badge>
                </div>
              )}
            </div>
          ))}
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
                    {gap.score}/{gap.max_score}
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
          <h2 className="text-sm font-semibold text-foreground">Answer review</h2>
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
                    <span
                      aria-label={hasAnswer(picked) ? "Answered" : "Left blank"}
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${
                        hasAnswer(picked)
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-destructive/40 bg-destructive/10 text-destructive"
                      }`}
                    >
                      {hasAnswer(picked) ? (
                        <Check aria-hidden="true" className="size-4" />
                      ) : (
                        <X aria-hidden="true" className="size-4" />
                      )}
                    </span>
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
