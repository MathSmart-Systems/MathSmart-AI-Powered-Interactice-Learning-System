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
import {
  checksStorageKey,
  fromStoredChecks,
  toStoredChecks,
} from "../utils/attempt-checks.js";
import { completionPercent } from "../utils/format.js";

/**
 * The remembered verdicts for one attempt, or nothing.
 *
 * Session storage, because the memory should last exactly as long as the tab
 * the learner is working in: a reload must keep it, and someone else opening
 * MathSmart on the same shared classroom machine tomorrow must not inherit it.
 * Every access is guarded — private browsing, a full quota and a blocked
 * origin all throw — and a failure simply means the verdicts are not restored,
 * which is where this started.
 */
function readStoredChecks(attemptId) {
  const key = checksStorageKey(attemptId);
  if (!key || typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredChecks(attemptId, stored) {
  const key = checksStorageKey(attemptId);
  if (!key || typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Nothing to do and nothing to tell the learner: the verdicts on screen
    // are unaffected, only the ones a reload could have brought back.
  }
}

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
  // What kind of refusal it was, kept beside the sentence. The player shows a
  // not-ready activity, a locked one and a missing one as three different
  // things, and the message alone cannot tell them apart.
  const [errorCode, setErrorCode] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);
  const [activity, setActivity] = useState(null);
  const [attempt, setAttempt] = useState(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [checks, setChecks] = useState({});
  const [hints, setHints] = useState({});
  const [hintState, setHintState] = useState({});
  const [hintError, setHintError] = useState({});
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
    setErrorCode(null);
    setErrorStatus(null);
    setOutcome(null);
    setAnswers({});
    setChecks({});
    setHints({});
    setHintState({});
    setHintError({});
    setCurrentIndex(0);
    startedAtRef.current = Date.now();

    try {
      // Detail first so a missing activity never starts an attempt.
      const detail = await loadActivityDetail(activityId);
      // The API's own answer to whether starting would work, checked before a
      // start is asked for. A learner who followed a link saved before the
      // questions were archived is told what is wrong here rather than being
      // sent into the player to collect a 409 from the start route.
      if (detail.isReady === false || detail.questions.length === 0) {
        throw new ActivityError(
          "This activity is not ready yet. Ask your teacher to finish setting it up.",
          { status: 409, code: "activity_not_ready" },
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
      // And the verdicts those answers already earned, where the answer has not
      // changed since. A resumed attempt that showed a learner their own
      // answers with no sign of which were right made them check the same
      // question twice to find out something they had already been told.
      setChecks(fromStoredChecks(readStoredChecks(started.attemptId), resumedAnswers));
      setStatus(PLAYER_STATUS.READY);
    } catch (cause) {
      const known = cause instanceof ActivityError;
      setError(
        known
          ? cause.message
          : "Something went wrong while opening this activity. Please try again.",
      );
      setErrorCode(known ? cause.code : null);
      setErrorStatus(known ? cause.status : null);
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

  /**
   * Remember the verdicts this attempt has been given, so a reload can restore
   * them. Only while the attempt is in play: a load in progress has cleared the
   * verdicts on purpose, and writing that emptiness out would erase the very
   * thing the next boot wants to read.
   */
  useEffect(() => {
    if (status !== PLAYER_STATUS.READY || !attempt?.attemptId) return;
    writeStoredChecks(attempt.attemptId, toStoredChecks(checks, answers));
  }, [status, attempt, checks, answers]);

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
    setHintError((previous) => ({ ...previous, [currentId]: null }));
    try {
      // The authored hint and, when Groq answered, a rephrasing of it. The
      // authored text is the hint; the advisory wording is kept beside it so
      // the card can show one, both, or neither without either standing in for
      // the other.
      const { hint, aiHint } = await requestHint({
        attemptId: attempt.attemptId,
        questionId: currentId,
      });
      if (hint) {
        setHints((previous) => ({
          ...previous,
          [currentId]: { text: hint, aiText: aiHint ?? null },
        }));
        setHintState((previous) => ({ ...previous, [currentId]: "done" }));
      } else {
        setHintState((previous) => ({ ...previous, [currentId]: "none" }));
      }
    } catch (cause) {
      // The service already phrases its failures for a learner, so the card can
      // say what happened before it says what to do about it.
      setHintError((previous) => ({
        ...previous,
        [currentId]: cause instanceof ActivityError ? cause.message : null,
      }));
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
      const result = await submitActivity({
        attemptId: attempt.attemptId,
        answers: answersForSubmission(),
        timeSpentSeconds: spent,
      });
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
    errorCode,
    errorStatus,
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
    hintError,
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