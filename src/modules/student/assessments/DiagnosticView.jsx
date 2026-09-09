"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  RefreshCw,
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
import {
  AssessmentError,
  MASTERY_BAND,
  newIdempotencyKey,
  startDiagnostic,
  submitDiagnostic,
} from "@/services/assessmentService";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * Presentation for each `mastery_band`. The bands and their thresholds are the
 * backend's decision; this map only says how each one looks.
 */
const BAND_STYLE = {
  [MASTERY_BAND.MASTERED]: {
    badge: "border-primary/40 bg-primary/10 text-primary",
    bar: "bg-primary",
  },
  [MASTERY_BAND.DEVELOPING]: {
    badge: "border-border bg-secondary text-secondary-foreground",
    bar: "bg-primary/45",
  },
  [MASTERY_BAND.NEEDS_IMPROVEMENT]: {
    badge: "border-destructive/40 bg-destructive/10 text-destructive",
    bar: "bg-destructive",
  },
};

const NEUTRAL_BAND_STYLE = {
  badge: "border-border bg-secondary text-secondary-foreground",
  bar: "bg-muted-foreground",
};

const styleFor = (band) => BAND_STYLE[band] ?? NEUTRAL_BAND_STYLE;

function formatClock(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Domain-grouped questions -> the flat, numbered list the learner walks. */
function flattenQuestions(domains) {
  const flat = [];

  for (const domain of domains) {
    for (const question of domain.questions) {
      flat.push({
        id: question.question_id,
        number: flat.length + 1,
        domain: domain.domain,
        prompt: question.question_text,
        type: question.question_type,
        options: question.options,
      });
    }
  }

  return flat;
}

/** Seconds still on the clock for an attempt that was started earlier. */
function remainingSeconds(startedAt, limitSeconds) {
  if (!startedAt) return limitSeconds;

  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return limitSeconds;

  const elapsed = Math.floor((Date.now() - started) / 1000);
  return Math.max(0, limitSeconds - elapsed);
}

function CenteredNotice({ icon: Icon, title, children, tone = "muted" }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <Icon
        aria-hidden="true"
        className={`size-9 ${tone === "destructive" ? "text-destructive" : "text-muted-foreground"}`}
      />
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      {children}
    </div>
  );
}

/**
 * The Grade 6 entry diagnostic: intro, timed question walk, and gap report.
 *
 * Scoring lives entirely on the server. This view sends answers and renders the
 * competency results that come back; it never sees an answer key.
 */
export function DiagnosticView() {
  const [screen, setScreen] = useState("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(60 * 60);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [domains, setDomains] = useState([]);
  const [total, setTotal] = useState(0);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(60 * 60);
  const [attemptId, setAttemptId] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const scrollAnchor = useRef(null);

  // One key per attempt, reused across retries: a resend after a dropped
  // connection must not score the attempt twice.
  const idempotencyKey = useRef(null);

  useEffect(() => {
    let cancelled = false;

    startDiagnostic()
      .then((data) => {
        if (cancelled) return;

        const limitSeconds = data.time_limit_minutes * 60;

        setQuestions(flattenQuestions(data.domains));
        setDomains(data.domains.map((domain) => domain.domain));
        setTotal(data.total_questions);
        setTimeLimitSeconds(limitSeconds);
        setSecondsLeft(remainingSeconds(data.started_at, limitSeconds));
        setAttemptId(data.attempt_id);
        idempotencyKey.current = newIdempotencyKey();

        // A resumed attempt brings its saved answers back with it.
        const saved = data.saved_answers;
        if (saved && Object.keys(saved).length > 0) {
          setAnswers(saved);
          setScreen("test");
        }

        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(
          error instanceof AssessmentError
            ? error.message
            : "We could not load your assessment. Please try again.",
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const current = questions[index] ?? null;
  const answeredCount = Object.keys(answers).length;
  const unanswered = useMemo(
    () => questions.filter((question) => answers[question.id] === undefined),
    [questions, answers],
  );
  const progress = total ? ((index + 1) / total) * 100 : 0;
  const isLast = index === total - 1;
  const lowTime = secondsLeft <= 60;

  const finish = useCallback(
    async (viaTimer = false) => {
      if (submitting) return;

      setSubmitting(true);
      setSubmitError(null);
      setPendingSubmit(false);
      setAutoSubmitted(viaTimer);

      try {
        const response = await submitDiagnostic({
          attemptId,
          idempotencyKey: idempotencyKey.current,
          answers: questions.map((question) => ({
            question_id: question.id,
            answer: answers[question.id] ?? "",
          })),
        });

        setResult(response);
        setScreen("report");
      } catch (error) {
        // Stay on the assessment so the learner can retry. Their answers are
        // still in state, and the idempotency key makes a resend safe.
        setSubmitError(
          error instanceof AssessmentError
            ? error.message
            : "We could not submit your assessment. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, attemptId, questions, answers],
  );

  useEffect(() => {
    if (screen !== "test") return undefined;

    const ticker = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          window.clearInterval(ticker);
          finish(true);
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(ticker);
  }, [screen, finish]);

  useEffect(() => {
    if (screen === "test" && scrollAnchor.current) {
      scrollAnchor.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [index, screen]);

  useEffect(() => {
    if (screen !== "test") return undefined;

    const onKey = (event) => {
      if (!current) return;

      const numeric = Number(event.key);
      if (numeric >= 1 && numeric <= current.options.length) {
        const option = current.options[numeric - 1];
        if (option) {
          setAnswers((prev) => ({ ...prev, [current.id]: option.key }));
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, current]);

  const beginAssessment = () => {
    setIndex(0);
    setPendingSubmit(false);
    setAutoSubmitted(false);
    setShowReview(false);
    setSubmitError(null);
    setResult(null);
    setScreen("test");
  };

  const selectOption = (optionKey) => {
    if (!current) return;
    setAnswers((prev) => ({ ...prev, [current.id]: optionKey }));
    setPendingSubmit(false);
  };

  const goNext = () => {
    if (isLast) {
      if (unanswered.length > 0 && !pendingSubmit) {
        setPendingSubmit(true);
        return;
      }
      finish(false);
      return;
    }
    setIndex((value) => Math.min(total - 1, value + 1));
  };

  const goPrevious = () => {
    setPendingSubmit(false);
    setIndex((value) => Math.max(0, value - 1));
  };

  const jumpTo = (target) => {
    setPendingSubmit(false);
    setIndex(target);
  };

  if (loading) {
    return (
      <div
        className="flex flex-col items-center gap-4 py-16 text-center"
        role="status"
      >
        <div className="size-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading your assessment…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <CenteredNotice icon={AlertCircle} title="Something went wrong" tone="destructive">
        <p className="max-w-prose text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </CenteredNotice>
    );
  }

  if (!total) {
    return (
      <CenteredNotice icon={AlertCircle} title="No diagnostic items yet">
        <p className="max-w-prose text-sm text-muted-foreground">
          The question bank for your grade is empty. Please tell your teacher.
        </p>
      </CenteredNotice>
    );
  }

  const gaps = result?.domain_scores.filter((entry) => entry.gap_identified) ?? [];

  return (
    <div className="flex flex-col gap-8">
      {screen === "intro" && (
        <section className="flex flex-col gap-8">
          <header className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles aria-hidden="true" className="size-4 text-primary" />
              MathSmart adaptive learning
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
              Let&apos;s find out exactly where to start.
            </h1>
            <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
          </header>

          <Card>
            <CardHeader className="gap-3">
              <Badge variant="outline" className="w-fit">
                Grade 6 · Entry diagnostic
              </Badge>
              <CardTitle className="text-xl font-semibold">
                {total} questions across {domains.length} mathematics domains
              </CardTitle>
              <CardDescription className="max-w-prose leading-relaxed">
                Your answers map your competency gaps and unlock a personalized
                module path. This is placement, not a graded exam.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-8">
              <dl className="grid gap-3 sm:grid-cols-3">
                {[
                  { icon: BookOpen, term: `${total} questions`, detail: "Multiple choice" },
                  {
                    icon: Timer,
                    term: `~${Math.round(timeLimitSeconds / 60)} minutes`,
                    detail: "Timed, single sitting",
                  },
                  {
                    icon: BarChart3,
                    term: `${domains.length} domains`,
                    detail: "Competency mapped",
                  },
                ].map(({ icon: Icon, term, detail }) => (
                  <div
                    key={term}
                    className="flex items-center gap-3 border border-border bg-background px-4 py-3"
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <dt className="truncate text-sm font-medium text-foreground">
                        {term}
                      </dt>
                      <dd className="truncate text-xs text-muted-foreground">{detail}</dd>
                    </div>
                  </div>
                ))}
              </dl>

              <div className="flex flex-col gap-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Before you begin
                </h2>
                <ol className="flex flex-col gap-4">
                  {[
                    "Read every question fully. Some items look familiar but ask for something different.",
                    `Answer all ${total}. A blank item counts as incorrect and can misplace your path.`,
                    "There is no penalty for a wrong answer.",
                    "The timer keeps running once you start. At 00:00 your work submits automatically.",
                  ].map((line, position) => (
                    <li key={line} className="flex gap-4">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-muted-foreground">
                        {position + 1}
                      </span>
                      <p className="max-w-prose text-sm leading-relaxed text-foreground">
                        {line}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>

              {domains.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-border pt-6">
                  {domains.map((domain) => (
                    <Badge key={domain} variant="secondary" className="font-normal">
                      {domain}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col items-stretch gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Your results save to your learner profile the moment you submit.
              </p>
              <Button size="lg" onClick={beginAssessment} className="group">
                Begin assessment
                <ArrowRight
                  aria-hidden="true"
                  className="transition-transform duration-300 ease-out group-hover:translate-x-1"
                />
              </Button>
            </CardFooter>
          </Card>
        </section>
      )}

      {screen === "test" && current && (
        <section className="flex flex-col gap-6" ref={scrollAnchor}>
          <div className="sticky top-0 z-20 -mx-5 border-b border-border bg-background/95 px-5 pt-4 pb-4 backdrop-blur-sm sm:-mx-8 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-foreground">
                  Question {index + 1}
                </span>
                <span className="text-sm text-muted-foreground">of {total}</span>
              </p>

              <div className="flex items-center gap-3">
                <Badge variant="outline" className="font-normal">
                  {current.domain}
                </Badge>
                <p
                  role="timer"
                  aria-live="off"
                  className={`flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-sm tabular-nums transition-colors duration-300 ${
                    lowTime
                      ? "border-destructive/50 bg-destructive/10 text-destructive"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  <Timer aria-hidden="true" className="size-4" />
                  {formatClock(secondsLeft)}
                  <span className="sr-only">remaining</span>
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div
                role="progressbar"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Assessment progress"
                className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {answeredCount}/{total} answered
              </span>
            </div>
          </div>

          <Card>
            <CardHeader className="gap-3">
              <CardDescription>{current.domain}</CardDescription>
              <CardTitle className="max-w-prose text-xl leading-snug font-medium">
                {current.prompt}
              </CardTitle>
            </CardHeader>

            <CardContent>
              {current.options.length === 0 ? (
                <p className="flex items-start gap-3 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm text-foreground">
                  <AlertCircle
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                  />
                  This question needs an answer format MathSmart cannot show yet.
                  Skip it and tell your teacher.
                </p>
              ) : (
                <fieldset className="flex flex-col gap-3">
                  <legend className="sr-only">
                    Choose one answer for question {index + 1}
                  </legend>
                  {current.options.map((option, optionIndex) => {
                    const selected = answers[current.id] === option.key;

                    return (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => selectOption(option.key)}
                        className={`flex w-full items-center gap-4 border px-4 py-4 text-left transition duration-200 ease-out ${
                          selected
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary"
                        }`}
                      >
                        <span
                          className={`flex size-8 shrink-0 items-center justify-center rounded-md border text-sm font-semibold transition-colors duration-200 ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {LETTERS[optionIndex] ?? optionIndex + 1}
                        </span>
                        <span className="text-base leading-relaxed">{option.label}</span>
                        {selected && (
                          <CheckCircle2
                            aria-hidden="true"
                            className="ml-auto size-5 shrink-0 text-primary"
                          />
                        )}
                      </button>
                    );
                  })}
                </fieldset>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-5 border-t border-border pt-6">
              {submitError && (
                <p
                  role="alert"
                  className="flex w-full items-start gap-3 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm text-foreground"
                >
                  <AlertCircle
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                  />
                  <span>
                    {submitError} Your answers are safe — press submit again to
                    retry.
                  </span>
                </p>
              )}

              {pendingSubmit && (
                <div className="flex w-full flex-col gap-3 border-l-[3px] border-destructive bg-destructive/5 px-4 py-4">
                  <p className="flex items-start gap-3 text-sm font-medium text-foreground">
                    <AlertCircle
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-destructive"
                    />
                    {unanswered.length}{" "}
                    {unanswered.length === 1 ? "question is" : "questions are"} still
                    blank. Blank counts as incorrect.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {unanswered.map((question) => (
                      <Button
                        key={question.id}
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => jumpTo(question.number - 1)}
                      >
                        Q{question.number}
                      </Button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3 pt-1">
                    <Button size="sm" onClick={() => finish(false)} disabled={submitting}>
                      {submitting ? "Submitting…" : "Submit anyway"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const first = unanswered[0];
                        setPendingSubmit(false);
                        if (first) setIndex(first.number - 1);
                      }}
                    >
                      Go to first blank
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex w-full items-center justify-between gap-4">
                <Button variant="outline" onClick={goPrevious} disabled={index === 0}>
                  <ArrowLeft aria-hidden="true" />
                  Previous
                </Button>

                <Button onClick={goNext} disabled={submitting}>
                  {isLast ? (
                    <>
                      {submitting ? "Submitting…" : "Submit assessment"}
                      <CheckCircle2 aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRight aria-hidden="true" />
                    </>
                  )}
                </Button>
              </div>
            </CardFooter>
          </Card>

          <nav aria-label="Question navigator" className="flex flex-wrap gap-1.5">
            {questions.map((question, position) => {
              const isCurrent = position === index;
              const isAnswered = answers[question.id] !== undefined;

              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => jumpTo(position)}
                  aria-current={isCurrent ? "true" : undefined}
                  aria-label={`Question ${position + 1}${isAnswered ? ", answered" : ", blank"}`}
                  className={`size-8 rounded-md border text-xs font-medium tabular-nums transition-colors duration-200 ${
                    isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : isAnswered
                        ? "border-border bg-secondary text-foreground hover:border-primary/40"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {position + 1}
                </button>
              );
            })}
          </nav>
        </section>
      )}

      {screen === "report" && result && (
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
                      className={`h-full rounded-full transition-[width] duration-700 ease-out ${styleFor(entry.mastery_band).bar}`}
                      style={{ width: `${entry.percentage}%` }}
                    />
                  </div>

                  {entry.mastery_band && (
                    <div className="flex justify-end">
                      <Badge
                        variant="outline"
                        className={styleFor(entry.mastery_band).badge}
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
                      <Badge variant="outline" className={styleFor(gap.mastery_band).badge}>
                        {gap.score}/{gap.max_score}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>

            <CardFooter className="flex flex-col items-stretch gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
              <Button asChild size="lg">
                <Link href="/student/my-learning">
                  <Sparkles aria-hidden="true" />
                  {result.next_action?.label ?? "Start recommended modules"}
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowReview((value) => !value)}
                aria-expanded={showReview}
              >
                <BookOpen aria-hidden="true" />
                {showReview ? "Hide my answers" : "Review my answers"}
              </Button>
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
                          aria-label={picked !== undefined ? "Answered" : "Left blank"}
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${
                            picked !== undefined
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-destructive/40 bg-destructive/10 text-destructive"
                          }`}
                        >
                          {picked !== undefined ? (
                            <Check aria-hidden="true" className="size-4" />
                          ) : (
                            <X aria-hidden="true" className="size-4" />
                          )}
                        </span>
                      </div>

                      <ul className="mt-4 flex flex-col gap-2">
                        {question.options.map((option, optionIndex) => {
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

                      {picked === undefined && (
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
      )}
    </div>
  );
}
