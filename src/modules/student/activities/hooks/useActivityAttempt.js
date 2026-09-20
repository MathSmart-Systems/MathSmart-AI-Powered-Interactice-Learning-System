"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  checkAnswer,
  loadActivityDetail,
  requestHint,
  startAttempt,
  submitActivity,
  ActivityError,
} from "../services/activities-api.js";
import { completionPercent } from "../utils/format.js";
import {
  activitySubmissionForAttempt,
  clearActivitySubmission,
} from "../utils/submission.js";

export const PLAYER_STATUS = Object.freeze({
  LOADING: "loading",
  ERROR: "error",
  READY: "ready",
  SUBMITTED: "submitted",
});

const MAX_TIME_SPENT_SECONDS = 86_400;

/**
 * The activity player's state machine.
 *
 * Loading, the per-question answer checks, hints and the final submit all run
 * here. The deterministic verdicts come back from the API unchanged; this hook
 * only stores them for the UI.
 */
export function useActivityAttempt(activityId) {
  const [status, setStatus] = useState(PLAYER_STATUS.LOADING);
  const [error, setError] = useState(null);
  const [activity, setActivity] = useState(null);
  const [attempt, setAttempt] = useState(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [checks, setChecks] = useState({});
  const [hints, setHints] = useState({});
  const [hintState, setHintState] = useState({});
  const [checking, setChecking] = useState(false);
  const [flowError, setFlowError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [outcome, setOutcome] = useState(null);

  const startedAtRef = useRef(null);
  const bootRef = useRef(null);

  const boot = useCallback(async () => {
    setStatus(PLAYER_STATUS.LOADING);
    setError(null);
    setOutcome(null);
    setAnswers({});
    setChecks({});
    setHints({});
    setHintState({});
    setCurrentIndex(0);
    startedAtRef.current = Date.now();

    try {
      // Detail first so a missing activity never starts an attempt.
      const detail = await loadActivityDetail(activityId);
      if (detail.questions.length === 0) {
        throw new ActivityError(
          "This activity does not have any questions yet. Please tell your teacher.",
          { code: "empty_activity" },
        );
      }

      const started = await startAttempt(activityId);

      // A resumed attempt may already carry answers for questions the learner
      // has answered and checked during an earlier session.
      const resumedAnswers = {};
      for (const q of detail.questions) {
        const saved = started.savedAnswers?.[q.id];
        if (saved !== undefined && saved !== null) {
          resumedAnswers[q.id] = saved;
        }
      }

      setActivity(detail);
      setAttempt(started);
      setAnswers((previous) => ({ ...previous, ...resumedAnswers }));
      setStatus(PLAYER_STATUS.READY);
    } catch (cause) {
      const message =
        cause instanceof ActivityError
          ? cause.message
          : "Something went wrong while opening this activity. Please try again.";
      setError(message);
      setStatus(PLAYER_STATUS.ERROR);
    }
  }, [activityId]);

  useEffect(() => {
    if (bootRef.current === boot) return;
    bootRef.current = boot;
    boot();
  }, [boot]);

  /** Primary loader runs exactly once per mount. */
  useEffect(() => {
    return () => {
      bootRef.current = null;
    };
  }, []);

  const questions = useMemo(() => activity?.questions ?? [], [activity]);
  const currentQuestion = questions[currentIndex] ?? null;
  const currentId = currentQuestion?.id ?? null;
  const currentCheck = currentId ? checks[currentId] ?? null : null;

  const answersForSubmission = useCallback(
    () =>
      questions.map((question) => ({
        questionId: question.id,
        answer: answers[question.id] ?? null,
      })),
    [questions, answers],
  );

  const selectAnswer = useCallback(
    (value) => {
      if (!currentId) return;
      setAnswers((previous) => ({ ...previous, [currentId]: value }));
      setChecks((previous) => {
        const { [currentId]: _dropped, ...rest } = previous;
        return rest;
      });
      setFlowError(null);
    },
    [currentId],
  );

  const selectOption = useCallback(
    (key) => selectAnswer(String(key)),
    [selectAnswer],
  );

  const changeValue = useCallback(
    (value) => selectAnswer(value),
    [selectAnswer],
  );

  const runCheck = useCallback(async () => {
    if (!currentId || !attempt) return;
    const value = answers[currentId];
    if (value === undefined || value === null || String(value).trim() === "") {
      setFlowError("Choose an answer first, then check it.");
      return;
    }
    if (currentCheck?.isCorrect) return;

    setChecking(true);
    setFlowError(null);
    try {
      const result = await checkAnswer({
        attemptId: attempt.attemptId,
        questionId: currentId,
        answer: value,
      });
      setChecks((previous) => ({
        ...previous,
        [currentId]: {
          isCorrect: result.is_correct === true,
          attemptsForQuestion: result.attempts_for_question ?? 1,
          feedback: result.explanation ?? null,
          hintAvailable: result.hint_available === true,
        },
      }));
    } catch (cause) {
      setFlowError(
        cause instanceof ActivityError
          ? cause.message
          : "Your answer could not be checked just now. Please try again.",
      );
    } finally {
      setChecking(false);
    }
  }, [attempt, currentId, currentCheck, answers]);

  const toggleHint = useCallback(async () => {
    if (!currentId || !attempt) return;
    if (hints[currentId]) return;

    setHintState((previous) => ({ ...previous, [currentId]: "loading" }));
    try {
      const hint = await requestHint({
        attemptId: attempt.attemptId,
        questionId: currentId,
      });
      if (hint) {
        setHints((previous) => ({ ...previous, [currentId]: hint }));
        setHintState((previous) => ({ ...previous, [currentId]: "done" }));
      } else {
        setHintState((previous) => ({ ...previous, [currentId]: "none" }));
      }
    } catch {
      setHintState((previous) => ({ ...previous, [currentId]: "error" }));
    }
  }, [attempt, currentId, hints]);

  const goTo = useCallback((next) => {
    setCurrentIndex((previous) => {
      const bound = Math.max(0, Math.min(questions.length - 1, next));
      return Number.isFinite(bound) ? bound : previous;
    });
    setFlowError(null);
  }, [questions.length]);

  const goPrevious = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);
  const goNext = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);

  const submit = useCallback(async () => {
    if (!attempt || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const spent = Math.min(
        MAX_TIME_SPENT_SECONDS,
        Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)),
      );
      const body = {
        answers: answersForSubmission().map(({ questionId, answer }) => ({
          question_id: questionId,
          answer,
        })),
        time_spent_seconds: spent,
      };
      const submission = activitySubmissionForAttempt(attempt.attemptId, body);
      const result = await submitActivity({
        attemptId: attempt.attemptId,
        ...submission,
      });
      clearActivitySubmission(attempt.attemptId);
      setOutcome(result);
      setStatus(PLAYER_STATUS.SUBMITTED);
    } catch (cause) {
      setSubmitError(
        cause instanceof ActivityError
          ? cause.message
          : "Your activity could not be submitted just now. Press finish again to retry.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [attempt, submitting, answersForSubmission]);

  const answeredCount = questions.filter((q) => {
    const value = answers[q.id];
    return value !== undefined && value !== null && String(value).trim() !== "";
  }).length;

  const progress = completionPercent(answeredCount, questions.length);

  return {
    status,
    error,
    activity,
    attempt,
    questions,
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
    restart: boot,
  };
}