"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Timer,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  BarChart3,
  RefreshCw,
  Sparkles,
  BookOpen,
  Award,
  Check,
  X,
} from "lucide-react";

import rawQuestions from "@/data/diagnosticQuestions.json";

const TOTAL_SECONDS = 20 * 60;
const LETTERS = ["A", "B", "C", "D", "E", "F"];

const TIERS = {
  accelerate: {
    id: "accelerate",
    label: "Accelerate",
    blurb:
      "Mastery is solid. Move ahead into enrichment tasks and higher-order problem sets.",
    badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    ring: "text-emerald-400",
    bar: "bg-emerald-400",
  },
  remediate: {
    id: "remediate",
    label: "Remediate",
    blurb:
      "Foundations are there but uneven. Targeted practice on the flagged competencies comes first.",
    badge: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    ring: "text-amber-400",
    bar: "bg-amber-400",
  },
  assist: {
    id: "assist",
    label: "Assist / Intensive Support",
    blurb:
      "Core skills need rebuilding. Guided, small-step modules with a teacher check-in each week.",
    badge: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    ring: "text-rose-400",
    bar: "bg-rose-400",
  },
};

function normalizeQuestions(source) {
  const list = Array.isArray(source)
    ? source
    : Array.isArray(source?.questions)
      ? source.questions
      : Array.isArray(source?.items)
        ? source.items
        : [];

  return list.map((entry, index) => {
    const rawOptions = entry?.options ?? entry?.choices ?? [];
    const options = (Array.isArray(rawOptions) ? rawOptions : []).map(
      (option, optionIndex) => {
        if (option !== null && typeof option === "object") {
          return {
            key: String(
              option.id ?? option.key ?? option.value ?? optionIndex,
            ),
            label: String(option.text ?? option.label ?? option.value ?? ""),
          };
        }
        return { key: String(optionIndex), label: String(option) };
      },
    );

    const rawAnswer =
      entry?.answer ??
      entry?.correctAnswer ??
      entry?.correct_answer ??
      entry?.correctOption ??
      entry?.correct ??
      null;

    let answerKey = null;
    if (typeof rawAnswer === "number") {
      answerKey = options[rawAnswer]?.key ?? String(rawAnswer);
    } else if (typeof rawAnswer === "string") {
      const trimmed = rawAnswer.trim();
      const byKey = options.find((option) => option.key === trimmed);
      const byLabel = options.find((option) => option.label === trimmed);
      const byLetter = /^[A-Fa-f]$/.test(trimmed)
        ? options[trimmed.toUpperCase().charCodeAt(0) - 65]
        : null;
      answerKey = (byKey ?? byLabel ?? byLetter)?.key ?? null;
    } else if (rawAnswer !== null && typeof rawAnswer === "object") {
      answerKey = String(rawAnswer.id ?? rawAnswer.key ?? rawAnswer.value ?? "");
    }

    return {
      id: String(entry?.id ?? entry?.code ?? `q-${index + 1}`),
      number: index + 1,
      domain: String(entry?.domain ?? entry?.strand ?? "General Mathematics"),
      competency: String(
        entry?.competency ?? entry?.skill ?? entry?.topic ?? "Unlabeled competency",
      ),
      prompt: String(
        entry?.question ?? entry?.prompt ?? entry?.text ?? "Untitled question",
      ),
      explanation: entry?.explanation ? String(entry.explanation) : null,
      options,
      answerKey,
    };
  });
}

function formatClock(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function tierFor(percent) {
  if (percent >= 75) return TIERS.accelerate;
  if (percent >= 50) return TIERS.remediate;
  return TIERS.assist;
}

export default function DiagnosticPage() {
  const questions = useMemo(() => normalizeQuestions(rawQuestions), []);
  const total = questions.length;

  const domains = useMemo(() => {
    const seen = [];
    for (const question of questions) {
      if (!seen.includes(question.domain)) seen.push(question.domain);
    }
    return seen;
  }, [questions]);

  const [screen, setScreen] = useState("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const scrollAnchor = useRef(null);

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
    (viaTimer = false) => {
      setPendingSubmit(false);
      setAutoSubmitted(viaTimer);
      setScreen("report");
    },
    [],
  );

  useEffect(() => {
    if (screen !== "test") return undefined;
    const ticker = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          clearInterval(ticker);
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

  const results = useMemo(() => {
    if (!total) {
      return {
        correct: 0,
        percent: 0,
        tier: TIERS.assist,
        byDomain: [],
        gaps: [],
      };
    }

    let correct = 0;
    const domainMap = new Map();
    const gapMap = new Map();

    for (const question of questions) {
      const picked = answers[question.id];
      const isCorrect = picked !== undefined && picked === question.answerKey;
      if (isCorrect) correct += 1;

      const bucket = domainMap.get(question.domain) ?? { correct: 0, total: 0 };
      bucket.total += 1;
      if (isCorrect) bucket.correct += 1;
      domainMap.set(question.domain, bucket);

      if (!isCorrect) {
        const gap = gapMap.get(question.competency) ?? {
          competency: question.competency,
          domain: question.domain,
          missed: 0,
          skipped: 0,
        };
        gap.missed += 1;
        if (picked === undefined) gap.skipped += 1;
        gapMap.set(question.competency, gap);
      }
    }

    const percent = Math.round((correct / total) * 100);

    return {
      correct,
      percent,
      tier: tierFor(percent),
      byDomain: Array.from(domainMap.entries()).map(([domain, value]) => ({
        domain,
        correct: value.correct,
        total: value.total,
        percent: Math.round((value.correct / value.total) * 100),
      })),
      gaps: Array.from(gapMap.values()).sort((a, b) => b.missed - a.missed),
    };
  }, [questions, answers, total]);

  const beginAssessment = () => {
    setAnswers({});
    setIndex(0);
    setSecondsLeft(TOTAL_SECONDS);
    setPendingSubmit(false);
    setAutoSubmitted(false);
    setShowReview(false);
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

  if (!total) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-24 text-slate-100">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
          <AlertCircle className="h-10 w-10 text-amber-400" aria-hidden="true" />
          <h1 className="text-2xl font-semibold tracking-tight">
            No diagnostic items found
          </h1>
          <p className="text-sm leading-relaxed text-slate-400">
            The question bank at <code className="text-slate-300">@/data/diagnosticQuestions.json</code>{" "}
            is empty or malformed. Seed it, then reload this page.
          </p>
          <Button
            variant="outline"
            className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-900 hover:text-slate-50"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reload
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-sky-500/30">
      <div className="mx-auto w-full max-w-4xl px-5 pb-24 pt-10 sm:px-8 lg:pt-16">
        {screen === "intro" && (
          <section className="flex flex-col gap-10">
            <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              <Sparkles className="h-4 w-4 text-sky-400" aria-hidden="true" />
              MathSmart Adaptive Learning
            </div>

            <Card className="border-slate-800 bg-slate-900/50 shadow-2xl shadow-slate-950/60">
              <CardHeader className="gap-4 border-b border-slate-800/80 pb-8">
                <Badge
                  variant="outline"
                  className="w-fit border-sky-500/40 bg-sky-500/10 text-sky-300"
                >
                  Grade 7 · Entry Diagnostic
                </Badge>
                <CardTitle className="text-3xl font-semibold leading-tight tracking-tight text-slate-50 sm:text-4xl">
                  Let&apos;s find out exactly where to start.
                </CardTitle>
                <CardDescription className="max-w-[62ch] text-base leading-relaxed text-slate-400">
                  Twenty questions across the four Grade 7 mathematics domains. Your
                  answers set your ARAL tier and unlock a personalized module path.
                </CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col gap-9 pt-8">
                <dl className="grid gap-3 sm:grid-cols-3">
                  {[
                    { icon: BookOpen, term: `${total} questions`, detail: "Multiple choice" },
                    { icon: Timer, term: "~20 minutes", detail: "Timed, single sitting" },
                    {
                      icon: BarChart3,
                      term: `${domains.length || 4} domains`,
                      detail: "Competency mapped",
                    },
                  ].map(({ icon: Icon, term, detail }) => (
                    <div
                      key={term}
                      className="flex items-center gap-3 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-3"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                      <div className="min-w-0">
                        <dt className="truncate text-sm font-medium text-slate-100">
                          {term}
                        </dt>
                        <dd className="truncate text-xs text-slate-500">{detail}</dd>
                      </div>
                    </div>
                  ))}
                </dl>

                <div className="space-y-5">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Before you begin
                  </h2>
                  <ol className="space-y-4">
                    {[
                      "Read every question fully. Some items look familiar but ask for something different.",
                      "Answer all 20. An unanswered item counts as incorrect and can misplace your tier.",
                      "No penalty for wrong answers. This is placement, not a graded exam.",
                      "The timer keeps running once you start. At 00:00 your work submits automatically.",
                    ].map((line, position) => (
                      <li key={line} className="flex gap-4">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-700 text-xs font-semibold text-slate-400">
                          {position + 1}
                        </span>
                        <p className="max-w-[68ch] text-sm leading-relaxed text-slate-300">
                          {line}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>

                {domains.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-800/80 pt-7">
                    {domains.map((domain) => (
                      <Badge
                        key={domain}
                        variant="secondary"
                        className="border-slate-800 bg-slate-800/60 font-normal text-slate-300"
                      >
                        {domain}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex flex-col items-stretch gap-4 border-t border-slate-800/80 pt-7 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-relaxed text-slate-500">
                  Your results save to your learner profile the moment you submit.
                </p>
                <Button
                  size="lg"
                  onClick={beginAssessment}
                  className="group h-12 bg-sky-500 px-7 text-base font-semibold text-slate-950 transition-colors duration-200 hover:bg-sky-400"
                >
                  Begin Assessment
                  <ArrowRight
                    className="ml-2 h-5 w-5 transition-transform duration-300 ease-out group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </Button>
              </CardFooter>
            </Card>
          </section>
        )}

        {screen === "test" && current && (
          <section className="flex flex-col gap-7" ref={scrollAnchor}>
            <div className="sticky top-0 z-20 -mx-5 border-b border-slate-800/80 bg-slate-950/90 px-5 pb-4 pt-4 backdrop-blur-sm sm:-mx-8 sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-slate-100">
                    Question {index + 1}
                  </span>
                  <span className="text-sm text-slate-500">of {total}</span>
                </div>

                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className="border-slate-700 bg-slate-900 font-normal text-slate-300"
                  >
                    {current.domain}
                  </Badge>
                  <div
                    className={`flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-sm tabular-nums transition-colors duration-300 ${lowTime
                      ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
                      : "border-slate-700 bg-slate-900 text-slate-200"
                      }`}
                    role="timer"
                    aria-live="off"
                  >
                    <Timer className="h-4 w-4" aria-hidden="true" />
                    {formatClock(secondsLeft)}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
                  role="progressbar"
                  aria-valuenow={Math.round(progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Assessment progress"
                >
                  <div
                    className="h-full rounded-full bg-sky-500 transition-[width] duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">
                  {answeredCount}/{total} answered
                </span>
              </div>
            </div>

            <Card className="border-slate-800 bg-slate-900/40">
              <CardHeader className="gap-3 pb-6">
                <CardDescription className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  {current.competency}
                </CardDescription>
                <CardTitle className="max-w-[46ch] text-xl font-medium leading-snug text-slate-50 sm:text-2xl">
                  {current.prompt}
                </CardTitle>
              </CardHeader>

              <CardContent className="pb-7">
                <fieldset className="space-y-3">
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
                        className={`flex w-full items-center gap-4 rounded-xl border px-4 py-4 text-left transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${selected
                          ? "border-sky-500 bg-sky-500/10 text-slate-50"
                          : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-600 hover:bg-slate-900/70"
                          }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold transition-colors duration-200 ${selected
                            ? "border-sky-400 bg-sky-500 text-slate-950"
                            : "border-slate-700 text-slate-400"
                            }`}
                        >
                          {LETTERS[optionIndex] ?? optionIndex + 1}
                        </span>
                        <span className="text-base leading-relaxed">{option.label}</span>
                        {selected && (
                          <CheckCircle2
                            className="ml-auto h-5 w-5 shrink-0 text-sky-400"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </fieldset>
              </CardContent>

              <CardFooter className="flex flex-col gap-5 border-t border-slate-800/80 pt-6">
                {pendingSubmit && (
                  <div className="w-full rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-5">
                    <div className="flex items-start gap-3">
                      <AlertCircle
                        className="mt-0.5 h-5 w-5 shrink-0 text-amber-400"
                        aria-hidden="true"
                      />
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-amber-200">
                          {unanswered.length}{" "}
                          {unanswered.length === 1 ? "question is" : "questions are"}{" "}
                          still blank. Blank counts as incorrect.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {unanswered.map((question) => (
                            <button
                              key={question.id}
                              type="button"
                              onClick={() => jumpTo(question.number - 1)}
                              className="rounded-md border border-amber-500/30 px-2.5 py-1 text-xs font-medium text-amber-200 transition-colors duration-200 hover:bg-amber-500/15"
                            >
                              Q{question.number}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-3 pt-1">
                          <Button
                            size="sm"
                            onClick={() => finish(false)}
                            className="bg-amber-400 text-slate-950 hover:bg-amber-300"
                          >
                            Submit anyway
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const first = unanswered[0];
                              setPendingSubmit(false);
                              if (first) setIndex(first.number - 1);
                            }}
                            className="text-slate-300 hover:bg-slate-800 hover:text-slate-50"
                          >
                            Go to first blank
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex w-full items-center justify-between gap-4">
                  <Button
                    variant="outline"
                    onClick={goPrevious}
                    disabled={index === 0}
                    className="border-slate-700 bg-transparent text-slate-200 transition-colors duration-200 hover:bg-slate-800 hover:text-slate-50 disabled:opacity-40"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                    Previous
                  </Button>

                  {isLast ? (
                    <Button
                      onClick={goNext}
                      className="bg-emerald-500 font-semibold text-slate-950 transition-colors duration-200 hover:bg-emerald-400"
                    >
                      Submit Assessment
                      <CheckCircle2 className="ml-2 h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : (
                    <Button
                      onClick={goNext}
                      className="bg-sky-500 font-semibold text-slate-950 transition-colors duration-200 hover:bg-sky-400"
                    >
                      Next
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>

            <nav
              aria-label="Question navigator"
              className="flex flex-wrap gap-1.5 px-1"
            >
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
                    className={`h-8 w-8 rounded-md border text-xs font-medium tabular-nums transition-colors duration-200 ${isCurrent
                      ? "border-sky-400 bg-sky-500 text-slate-950"
                      : isAnswered
                        ? "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500"
                        : "border-slate-800 bg-transparent text-slate-600 hover:border-slate-600 hover:text-slate-300"
                      }`}
                  >
                    {position + 1}
                  </button>
                );
              })}
            </nav>
          </section>
        )}

        {screen === "report" && (
          <section className="flex flex-col gap-8">
            <header className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                <BarChart3 className="h-4 w-4 text-sky-400" aria-hidden="true" />
                Learning Gap & ARAL Diagnostic Report
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
                Here&apos;s your starting point.
              </h1>
              {autoSubmitted && (
                <p className="flex items-center gap-2 text-sm text-amber-300">
                  <Timer className="h-4 w-4" aria-hidden="true" />
                  Time ran out, so the assessment submitted automatically.
                </p>
              )}
            </header>

            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <Card className="border-slate-800 bg-slate-900/50">
                <CardContent className="flex h-full flex-col justify-center gap-2 py-8 text-center">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Raw score
                  </p>
                  <p className="font-mono text-5xl font-semibold tabular-nums text-slate-50">
                    {results.correct}
                    <span className="text-2xl text-slate-500">/{total}</span>
                  </p>
                  <p className={`text-lg font-semibold ${results.tier.ring}`}>
                    {results.percent}%
                  </p>
                </CardContent>
              </Card>

              <Card className={`border bg-slate-900/50 ${results.tier.badge.split(" ")[0]}`}>
                <CardHeader className="gap-3 pb-4">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    <Award className="h-4 w-4" aria-hidden="true" />
                    Assigned ARAL tier
                  </div>
                  <Badge
                    variant="outline"
                    className={`w-fit px-3 py-1 text-base font-semibold ${results.tier.badge}`}
                  >
                    {results.tier.label}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <p className="max-w-[52ch] text-sm leading-relaxed text-slate-300">
                    {results.tier.blurb}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-800 bg-slate-900/40">
              <CardHeader className="pb-5">
                <CardTitle className="text-base font-semibold text-slate-100">
                  Performance by domain
                </CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  Where the score came from, strand by strand.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {results.byDomain.map((entry) => (
                  <div key={entry.domain} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm font-medium text-slate-200">
                        {entry.domain}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-slate-400">
                        {entry.correct}/{entry.total} · {entry.percent}%
                      </span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-slate-800"
                      role="progressbar"
                      aria-valuenow={entry.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${entry.domain} mastery`}
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-700 ease-out ${tierFor(entry.percent).bar}`}
                        style={{ width: `${entry.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/40">
              <CardHeader className="pb-5">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-100">
                  <AlertCircle className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  Identified learning gaps
                </CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  {results.gaps.length === 0
                    ? "Nothing flagged."
                    : `${results.gaps.length} ${results.gaps.length === 1 ? "competency" : "competencies"} to rebuild first.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {results.gaps.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-4">
                    <CheckCircle2
                      className="h-5 w-5 shrink-0 text-emerald-400"
                      aria-hidden="true"
                    />
                    <p className="text-sm text-emerald-200">
                      Every competency cleared. Enrichment modules are unlocked.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-800">
                    {results.gaps.map((gap) => (
                      <li
                        key={gap.competency}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-100">
                            {gap.competency}
                          </p>
                          <p className="text-xs text-slate-500">{gap.domain}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {gap.skipped > 0 && (
                            <Badge
                              variant="outline"
                              className="border-slate-700 bg-transparent text-xs font-normal text-slate-400"
                            >
                              {gap.skipped} skipped
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className="border-rose-500/30 bg-rose-500/10 text-xs font-normal text-rose-300"
                          >
                            {gap.missed} missed
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
              <CardFooter className="flex flex-col items-stretch gap-4 border-t border-slate-800/80 pt-6 sm:flex-row sm:items-center">
                <Button
                  asChild
                  size="lg"
                  className="h-12 bg-sky-500 px-6 font-semibold text-slate-950 transition-colors duration-200 hover:bg-sky-400"
                >
                  <Link href="/dashboard">
                    <Sparkles className="mr-2 h-5 w-5" aria-hidden="true" />
                    Start Recommended Modules
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setShowReview((value) => !value)}
                  aria-expanded={showReview}
                  className="h-12 border-slate-700 bg-transparent text-slate-200 transition-colors duration-200 hover:bg-slate-800 hover:text-slate-50"
                >
                  <BookOpen className="mr-2 h-5 w-5" aria-hidden="true" />
                  {showReview ? "Hide Answers" : "Review Answers"}
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={beginAssessment}
                  className="h-12 text-slate-400 transition-colors duration-200 hover:bg-slate-800 hover:text-slate-100 sm:ml-auto"
                >
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Retake
                </Button>
              </CardFooter>
            </Card>

            {showReview && (
              <div className="space-y-4">
                <h2 className="px-1 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Answer review
                </h2>
                <ol className="space-y-4">
                  {questions.map((question) => {
                    const picked = answers[question.id];
                    const isCorrect = picked !== undefined && picked === question.answerKey;
                    return (
                      <li
                        key={question.id}
                        className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 space-y-1">
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                              Q{question.number} · {question.domain}
                            </p>
                            <p className="max-w-[60ch] text-base leading-snug text-slate-100">
                              {question.prompt}
                            </p>
                          </div>
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${isCorrect
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                              : "border-rose-500/40 bg-rose-500/10 text-rose-400"
                              }`}
                            aria-label={isCorrect ? "Correct" : "Incorrect"}
                          >
                            {isCorrect ? (
                              <Check className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <X className="h-4 w-4" aria-hidden="true" />
                            )}
                          </span>
                        </div>

                        <ul className="mt-4 space-y-2">
                          {question.options.map((option, optionIndex) => {
                            const isPicked = picked === option.key;
                            const isAnswer = question.answerKey === option.key;
                            const tone = isAnswer
                              ? "border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-100"
                              : isPicked
                                ? "border-rose-500/40 bg-rose-500/[0.08] text-rose-100"
                                : "border-slate-800 text-slate-400";
                            return (
                              <li
                                key={option.key}
                                className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${tone}`}
                              >
                                <span className="font-mono text-xs text-slate-500">
                                  {LETTERS[optionIndex] ?? optionIndex + 1}
                                </span>
                                <span className="leading-relaxed">{option.label}</span>
                                {isAnswer && (
                                  <span className="ml-auto shrink-0 text-xs font-medium text-emerald-300">
                                    Correct
                                  </span>
                                )}
                                {isPicked && !isAnswer && (
                                  <span className="ml-auto shrink-0 text-xs font-medium text-rose-300">
                                    Your answer
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>

                        {picked === undefined && (
                          <p className="mt-3 text-xs text-amber-300">
                            Left blank during the assessment.
                          </p>
                        )}

                        {question.explanation && (
                          <p className="mt-3 max-w-[68ch] border-t border-slate-800 pt-3 text-sm leading-relaxed text-slate-400">
                            {question.explanation}
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
    </main>
  );
}
