"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, LoaderCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useActivityAttempt, PLAYER_STATUS } from "../hooks/useActivityAttempt.js";
import { useAIFeedback } from "../hooks/useAIFeedback.js";
import { startRefusal } from "../utils/activities-model.js";
import { usePreservedScroll } from "@/modules/shared/hooks/usePreservedScroll";
import { ActivityRefusal } from "./ActivitiesUnavailable.jsx";
import { ActivityCompletion } from "./ActivityCompletion.jsx";
import { ActivityPlayerSkeleton } from "./ActivityPlayerSkeleton.jsx";
import { ActivityProgress } from "./ActivityProgress.jsx";
import { FeedbackPanel } from "./FeedbackPanel.jsx";
import { QuestionCard } from "./QuestionCard.jsx";

/**
 * The activity player: a client container that runs the deterministic attempt
 * state machine plus the optional advisory AI assistance, and composes the
 * presentational pieces.
 *
 * Two things this container owns beyond composition, because only it can see
 * both the state machine and the rendered screen: where the page is scrolled to
 * across a change, and where the keyboard is left afterwards.
 */
export function ActivityPlayer({ activityId }) {
  const player = useActivityAttempt(activityId);
  const ai = useAIFeedback();
  const preserveScroll = usePreservedScroll();

  const {
    status,
    error,
    errorCode,
    errorStatus,
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
    hintError,
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

  /** The button that carries the learner forward: Next, or Finish on the last one. */
  const advanceRef = useRef(null);
  const playerHeadingRef = useRef(null);
  const completionHeadingRef = useRef(null);
  /** Set when a retry leaves the report, read when the questions come back. */
  const returningFromReport = useRef(false);
  const previousStatus = useRef(status);

  /**
   * Whether there is nothing on screen yet, as opposed to a screen being
   * rebuilt.
   *
   * "Try again" and "Try the Activity Again" both re-run the loader, and the
   * skeleton used to take the whole player away while they did — a short page
   * of placeholders in place of a tall page of real content, which moves the
   * reader and then moves them back. The skeleton is for arriving with nothing.
   */
  const isFirstLoad = status === PLAYER_STATUS.LOADING && activity === null;
  const isReloading = status === PLAYER_STATUS.LOADING && activity !== null;

  /**
   * Runs a handler with the reader's place kept.
   *
   * Twice, because an asynchronous handler's render happens after its `await`
   * and a single reading taken on the click would be spent on the render that
   * only turned a spinner on.
   */
  const keepingPlace =
    (run) =>
    async (...args) => {
      preserveScroll();
      try {
        return await run?.(...args);
      } finally {
        preserveScroll();
      }
    };

  // A new question gets a clean advisory panel.
  useEffect(() => {
    ai.clearAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id]);

  // After a wrong answer is confirmed, ask (best-effort) for an AI explanation.
  useEffect(() => {
    if (currentQuestion && currentCheck && !currentCheck.isCorrect && answered) {
      keepingPlace(ai.analyze)({
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

  /**
   * A correct answer takes the "Check answer" button away, and the keyboard
   * went with it: focus fell to `<body>`, so the next Tab started again from
   * the top of the page. It is handed to the button that now does the work
   * instead, without scrolling, since the learner has not asked to move.
   */
  useEffect(() => {
    if (currentCheck?.isCorrect !== true) return;
    if (typeof document === "undefined") return;
    if (document.activeElement && document.activeElement !== document.body) return;
    advanceRef.current?.focus({ preventScroll: true });
  }, [currentCheck?.isCorrect, currentIndex]);

  /**
   * Submitting replaces a tall player with a short report, and retrying
   * replaces the report with the player again. Each moves the keyboard to the
   * heading of whatever has arrived, which brings that heading into view if it
   * is not already — rather than scrolling the window to the top, which would
   * throw away a place the learner may still want.
   *
   * A retry passes through loading on its way back, so the intent is latched
   * when the report is left rather than inferred from the status just before
   * the questions return.
   */
  useEffect(() => {
    const was = previousStatus.current;
    previousStatus.current = status;

    if (status === PLAYER_STATUS.SUBMITTED) {
      completionHeadingRef.current?.focus();
      return;
    }
    if (was === PLAYER_STATUS.SUBMITTED) {
      returningFromReport.current = true;
    }
    if (status === PLAYER_STATUS.READY && returningFromReport.current) {
      returningFromReport.current = false;
      playerHeadingRef.current?.focus();
    }
  }, [status]);

  if (isFirstLoad) {
    return <ActivityPlayerSkeleton />;
  }

  if (status === PLAYER_STATUS.ERROR) {
    // Which refusal this was, decided from the API's own status and code
    // rather than from the sentence. An activity with no questions, one the
    // learning path has not opened and one that is not there are three
    // different answers, and a learner can act on each of them differently.
    return (
      <ActivityRefusal
        refusal={startRefusal({ status: errorStatus, code: errorCode })}
        message={error}
        onRetry={keepingPlace(restart)}
      />
    );
  }

  if (status === PLAYER_STATUS.SUBMITTED && outcome) {
    return (
      <ActivityCompletion
        outcome={outcome}
        encouragement={ai.encouragement}
        encouragementLoading={ai.encouragementLoading}
        headingRef={completionHeadingRef}
        onTryAgain={keepingPlace(restart)}
      />
    );
  }

  const value = currentAnswer !== undefined ? String(currentAnswer) : "";
  const currentHint = currentQuestion ? (hints[currentQuestion.id] ?? null) : null;

  return (
    <section className="flex flex-col gap-6" aria-labelledby="player-heading">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">
          Practice activity · {activity?.competencyName ?? "Grade 6 mathematics"}
        </p>
        <h1
          id="player-heading"
          ref={playerHeadingRef}
          tabIndex={-1}
          className="font-display text-3xl font-semibold tracking-tight text-foreground"
        >
          {activity?.title ?? "Activity"}
        </h1>
        {activity?.description && (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            {activity.description}
          </p>
        )}
      </header>

      {/*
        A strip that is the same height whether or not it says anything, so
        starting the activity again does not shift the page by a line as the
        message arrives and again as it goes.
      */}
      <div className="flex min-h-5 items-center">
        {isReloading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
            Setting up your next try…
          </p>
        ) : null}
      </div>

      <div
        aria-busy={isReloading}
        className={
          isReloading
            ? "flex flex-col gap-6 opacity-60 transition-opacity motion-reduce:transition-none"
            : "flex flex-col gap-6 transition-opacity motion-reduce:transition-none"
        }
      >
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
            hint={currentHint?.text ?? null}
            aiHint={currentHint?.aiText ?? null}
            hintState={currentQuestion ? (hintState[currentQuestion.id] ?? "idle") : "idle"}
            hintError={currentQuestion ? (hintError[currentQuestion.id] ?? null) : null}
            checking={checking}
            onSelectOption={keepingPlace(selectOption)}
            onChangeValue={keepingPlace(changeValue)}
            onToggleHint={keepingPlace(toggleHint)}
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

        <div className="flex w-full flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <Button
            variant="outline"
            onClick={keepingPlace(goPrevious)}
            disabled={currentIndex === 0}
          >
            <ArrowLeft aria-hidden="true" />
            Previous
          </Button>

          <div className="flex flex-wrap items-center gap-3">
            {canCheck && (
              <Button variant="secondary" onClick={keepingPlace(runCheck)} disabled={checking}>
                <Send aria-hidden="true" />
                {checking ? "Checking…" : "Check answer"}
              </Button>
            )}

            {isLast ? (
              <Button ref={advanceRef} onClick={keepingPlace(submit)} disabled={submitting}>
                {submitting ? "Finishing…" : "Finish activity"}
                <ArrowRight aria-hidden="true" />
              </Button>
            ) : (
              <Button ref={advanceRef} onClick={keepingPlace(goNext)} disabled={checking}>
                Next
                <ArrowRight aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
