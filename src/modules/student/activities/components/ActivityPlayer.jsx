"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useActivityAttempt, PLAYER_STATUS } from "../hooks/useActivityAttempt.js";
import { useAIFeedback } from "../hooks/useAIFeedback.js";
import { ActivityCompletion } from "./ActivityCompletion.jsx";
import { ActivityPlayerSkeleton } from "./ActivityPlayerSkeleton.jsx";
import { ActivityProgress } from "./ActivityProgress.jsx";
import { FeedbackPanel } from "./FeedbackPanel.jsx";
import { QuestionCard } from "./QuestionCard.jsx";

/**
 * The activity player: a client container that runs the deterministic attempt
 * state machine plus the optional advisory AI assistance, and composes the
 * presentational pieces.
 */
export function ActivityPlayer({ activityId }) {
  const player = useActivityAttempt(activityId);
  const ai = useAIFeedback();

  const {
    status,
    error,
    activity,
    currentQuestion,
    currentIndex,
    currentCheck,
    answers,
    answeredCount,
    progress,
    checking,
    flowError,
    submitting,
    submitError,
    outcome,
    hints,
    hintState,
    selectOption,
    changeValue,
    runCheck,
    toggleHint,
    goPrevious,
    goNext,
    submit,
    restart,
  } = player;

  const total = player.questions.length;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const answered =
    currentAnswer !== undefined && currentAnswer !== null && String(currentAnswer).trim() !== "";
  const canCheck = answered && !currentCheck?.isCorrect && !checking;
  const isLast = currentIndex === total - 1;

  // A new question gets a clean advisory panel.
  useEffect(() => {
    ai.clearAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id]);

  // After a wrong answer is confirmed, ask (best-effort) for an AI explanation.
  useEffect(() => {
    if (
      currentQuestion &&
      currentCheck &&
      !currentCheck.isCorrect &&
      answered
    ) {
      ai.analyze({
        questionId: currentQuestion.id,
        questionText: currentQuestion.text,
        submittedAnswer: currentAnswer,
        competencyId: currentQuestion.competencyId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id, currentCheck?.isCorrect, currentAnswer]);

  // After a finished activity, ask (best-effort) for advisory encouragement.
  useEffect(() => {
    if (status === PLAYER_STATUS.SUBMITTED && outcome) {
      ai.encourage({
        competencyId: activity?.competencyId ?? null,
        score: outcome.accuracy ?? null,
        masteryBand: outcome.masteryBand ?? null,
        displayContext: activity
          ? `${activity.title}. ${activity.competencyName ?? "Grade 6 mathematics"}.`
          : "Grade 6 mathematics practice activity.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, outcome]);

  if (status === PLAYER_STATUS.LOADING) {
    return <ActivityPlayerSkeleton />;
  }

  if (status === PLAYER_STATUS.ERROR) {
    return (
      <section className="flex flex-col gap-8" aria-labelledby="player-error-heading">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium text-primary">Student activities</p>
          <h1 id="player-error-heading" className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Activity unavailable
          </h1>
          <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        </header>

        <div
          role="alert"
          className="flex max-w-2xl flex-col gap-4 border-l-[3px] border-destructive bg-destructive/5 px-6 py-6"
        >
          <div className="flex items-center gap-2.5 text-destructive">
            <AlertCircle aria-hidden="true" className="size-4" />
            <p className="text-base font-semibold">{error ?? "This activity could not be opened."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button variant="outline" className="h-11 px-5" onClick={restart}>
              Try again
            </Button>
            <Button asChild variant="outline" className="h-11 px-5">
              <Link href="/student/activities">Back to Activities</Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (status === PLAYER_STATUS.SUBMITTED && outcome) {
    return (
      <ActivityCompletion
        outcome={outcome}
        encouragement={ai.encouragement}
        encouragementLoading={ai.encouragementLoading}
        onTryAgain={restart}
      />
    );
  }

  const value = currentAnswer !== undefined ? String(currentAnswer) : "";

  return (
    <section className="flex flex-col gap-6" aria-labelledby="player-heading">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">
          Practice activity · {activity?.competencyName ?? "Grade 6 mathematics"}
        </p>
        <h1 id="player-heading" className="font-display text-3xl font-semibold tracking-tight text-foreground">
          {activity?.title ?? "Activity"}
        </h1>
        {activity?.description && (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            {activity.description}
          </p>
        )}
      </header>

      <ActivityProgress
        index={currentIndex}
        total={total}
        competencyName={currentQuestion?.competencyName ?? null}
        answeredCount={answeredCount}
        progress={progress}
      />

      <div className="border border-border bg-card px-6 py-6">
        <QuestionCard
          question={currentQuestion}
          value={value}
          check={currentCheck}
          hint={currentQuestion ? hints[currentQuestion.id] ?? null : null}
          hintState={currentQuestion ? hintState[currentQuestion.id] ?? "idle" : "idle"}
          checking={checking}
          onSelectOption={selectOption}
          onChangeValue={changeValue}
          onToggleHint={toggleHint}
        />
      </div>

      <FeedbackPanel
        check={currentCheck}
        explanation={ai.explanation}
        explanationLoading={ai.explanationLoading}
        explanationUnavailable={ai.explanationAttempted}
      />

      {(flowError || submitError) && (
        <p
          role="alert"
          className="flex items-start gap-3 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm text-foreground"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{flowError ?? `${submitError} Press finish again to retry.`}</span>
        </p>
      )}

      <div className="flex w-full items-center justify-between gap-4 border-t border-border pt-6">
        <Button variant="outline" onClick={goPrevious} disabled={currentIndex === 0}>
          <ArrowLeft aria-hidden="true" />
          Previous
        </Button>

        <div className="flex items-center gap-3">
          {canCheck && (
            <Button variant="secondary" onClick={runCheck} disabled={checking}>
              <Send aria-hidden="true" />
              {checking ? "Checking…" : "Check answer"}
            </Button>
          )}

          {isLast ? (
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Finishing…" : "Finish activity"}
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : (
            <Button onClick={goNext} disabled={checking}>
              Next
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}