"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Lock, RefreshCw, SearchX, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreservedScroll } from "@/modules/shared/hooks/usePreservedScroll";

import {
  AssessmentError,
  QUESTION_TYPE,
  loadAssessmentPreview,
  loadDiagnostic,
  loadDiagnosticResult,
  saveDiagnosticAnswers,
  startDiagnostic,
  submitDiagnostic,
} from "./services/diagnostic-service";

import {
  attemptDeadline,
  flattenDiagnosticQuestions,
  hasAnswer,
  numericShortcutIndex,
  remainingSeconds,
  submissionConfirmation,
} from "./utils/format";

import {
  clearDraft,
  clearIdempotencyKey,
  clearSavedDraftAnswers,
  idempotencyKeyForAttempt,
  readDraft,
  reconcileDraftAnswers,
  writeDraft,
} from "./utils/reconciliation";

import { REFUSAL, startRefusal } from "./utils/catalogue";

import { AssessmentPlayerSkeleton } from "./components/AssessmentPlayerSkeleton";
import { DiagnosticIntro } from "./components/DiagnosticIntro";
import { DiagnosticPlayer } from "./components/DiagnosticPlayer";
import { DiagnosticResultsView } from "./components/DiagnosticResultsView";

const COMPLETED_ATTEMPT_STATUSES = new Set(["scored"]);
const PENDING_ATTEMPT_STATUSES = new Set(["submitted"]);

/** A picture per refusal, so the tone is never the only thing carrying it. */
const REFUSAL_ICON = Object.freeze({
  [REFUSAL.NOT_READY]: Wrench,
  [REFUSAL.LOCKED]: Lock,
  [REFUSAL.MISSING]: SearchX,
  [REFUSAL.FAULT]: AlertCircle,
});

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
 * Sitting an assessment: intro, timed question walk, and report.
 *
 * Named for the diagnostic because that is the only paper it could once play.
 * `/student/assessments/[assessmentId]` redirected everything here, so a unit
 * quiz was unreachable however many a teacher published. It now plays whichever
 * paper it is given: with an `assessmentId` it loads that one, and without one
 * it finds the learner's own grade diagnostic exactly as before. Every state
 * below is the same state it has always had — the diagnostic is simply no
 * longer the only thing that can be in it.
 *
 * Scoring lives entirely on the server. This view sends answers and renders the
 * competency results that come back; it never sees an answer key.
 */
export function DiagnosticView({
  assessmentId = null,
  requestedAttemptId = null,
  invalidAttemptLink = false,
}) {
  const [screen, setScreen] = useState("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(60 * 60);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // Which refusal the failed load was, kept beside its sentence. A paper with
  // no questions, one this learner may not sit and one that is not there are
  // three different answers, and only the status and code can tell them apart.
  const [loadRefusal, setLoadRefusal] = useState(null);
  // Bumped to ask the load effect to run again. A full document reload threw
  // away the whole page to recover from one failed request, which re-showed
  // the loading state and sent the reader back to the top.
  const [reloadToken, setReloadToken] = useState(0);
  const [submitError, setSubmitError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [domains, setDomains] = useState([]);
  const [total, setTotal] = useState(0);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(60 * 60);
  const [attemptId, setAttemptId] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const scrollAnchor = useRef(null);
  const reportRegion = useRef(null);
  const preserveScroll = usePreservedScroll();
  const finalSubmitTrigger = useRef(null);
  const dialogInitialFocus = useRef(null);
  const reviewQuestionAfterClose = useRef(false);
  const questionCard = useRef(null);
  const deadline = useRef(null);
  const answersRef = useRef({});
  const draftRef = useRef({});
  const pendingSaves = useRef(new Map());
  const saveLoop = useRef(null);
  const submissionStarted = useRef(false);
  const timerSubmissionAttempted = useRef(false);

  // One key per attempt, reused across retries: a resend after a dropped
  // connection must not score the attempt twice.
  const idempotencyKey = useRef(null);

  /**
   * Records a failed load as the kind of thing it actually was.
   *
   * The service already phrases its refusals for a learner, so the message is
   * the server's; only the heading, the glyph and the colour are decided here,
   * and none of them may claim a fault the server did not report.
   */
  const recordFailure = useCallback((error, fallbackText) => {
    const known = error instanceof AssessmentError;
    setLoadError(known ? error.message : fallbackText);
    setLoadRefusal(startRefusal(known ? { status: error.status, code: error.code } : {}));
  }, []);

  const hydrateAttempt = useCallback((data) => {
    const limitSeconds = data.time_limit_minutes * 60;
    const flatQuestions = flattenDiagnosticQuestions(data.domains);
    const deliveredIds = new Set(flatQuestions.map((question) => question.id));
    const localDraft = readDraft(data.attempt_id);
    const saved = reconcileDraftAnswers(data.saved_answers, localDraft, deliveredIds);
    const filteredDraft = reconcileDraftAnswers({}, localDraft, deliveredIds);

    draftRef.current = filteredDraft;
    writeDraft(data.attempt_id, filteredDraft);
    pendingSaves.current = new Map(Object.entries(filteredDraft));
    setQuestions(flatQuestions);
    setDomains(data.domains.map((domain) => domain.domain));
    setTotal(flatQuestions.length);
    setTimeLimitSeconds(limitSeconds);
    deadline.current = attemptDeadline(data.started_at, limitSeconds);
    setSecondsLeft(remainingSeconds(deadline.current, limitSeconds));
    setAttemptId(data.attempt_id);
    setAnswers(saved);
    answersRef.current = saved;
    idempotencyKey.current = idempotencyKeyForAttempt(data.attempt_id);
    timerSubmissionAttempted.current = false;
    setScreen("test");
  }, []);

  useEffect(() => {
    if (invalidAttemptLink) return undefined;

    let cancelled = false;

    const load = requestedAttemptId
      ? loadDiagnosticResult(requestedAttemptId).then((requested) => {
          if (cancelled) return;
          if (requested?.status !== "scored") {
            throw new AssessmentError("This diagnostic report is not ready yet.");
          }
          setResult(requested);
          setScreen("report");
        })
      : (assessmentId
          ? loadAssessmentPreview(assessmentId)
          : loadDiagnostic()
        ).then(async (preview) => {
        if (cancelled) return;
        setAssessment(preview);
        setTotal(preview.total_questions);
        setTimeLimitSeconds(preview.time_limit_minutes * 60);

        // The API's own answer to whether a start request would succeed,
        // asked before the intro offers one. A learner who typed this URL or
        // followed a link saved before the paper lost a question is told what
        // is wrong here, rather than pressing Begin and collecting a 409.
        if (preview.is_ready === false) {
          throw new AssessmentError(
            "This assessment is not ready yet. Ask your teacher to finish setting it up.",
            { status: 409, code: "assessment_not_ready" },
          );
        }

        if (preview.diagnostic_status === "in_progress") {
          if (!preview.latest_attempt_id || preview.latest_status !== "in_progress") {
            throw new AssessmentError(
              "Your diagnostic is marked in progress, but the active attempt could not be found. Please ask your teacher for help.",
            );
          }

          const resumed = await startDiagnostic(preview.assessment_id);
          if (!cancelled) hydrateAttempt(resumed);
        } else if (PENDING_ATTEMPT_STATUSES.has(preview.latest_status)) {
          throw new AssessmentError(
            "Your diagnostic has been submitted and is still being finalized. Please try again shortly.",
          );
        } else if (
          preview.diagnostic_status === "completed" &&
          !preview.reassessment_eligible
        ) {
          if (
            !preview.latest_attempt_id ||
            !COMPLETED_ATTEMPT_STATUSES.has(preview.latest_status)
          ) {
            throw new AssessmentError(
              "Your diagnostic is complete, but the saved result could not be found. Please ask your teacher for help.",
            );
          }

          const completed = await loadDiagnosticResult(preview.latest_attempt_id);
          if (!cancelled) {
            setResult(completed);
            setScreen("report");
          }
        } else if (
          preview.diagnostic_status !== "not_started" &&
          !(preview.diagnostic_status === "completed" && preview.reassessment_eligible)
        ) {
          throw new AssessmentError(
            "Your diagnostic status is unavailable right now. Please try again or ask your teacher for help.",
          );
        }
      });

    load
      .catch((error) => {
        if (cancelled) return;
        recordFailure(error, "We could not load your assessment. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    assessmentId,
    hydrateAttempt,
    invalidAttemptLink,
    recordFailure,
    reloadToken,
    requestedAttemptId,
  ]);

  useEffect(() => {
    if (screen !== "report") return;
    // preventScroll, because the place is kept by the handler that caused the
    // change. Focusing without it would scroll the region into view and undo
    // exactly what was preserved.
    reportRegion.current?.focus({ preventScroll: true });
  }, [screen]);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setLoadRefusal(null);
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  const current = questions[index] ?? null;
  const answeredCount = questions.filter((question) => hasAnswer(answers[question.id])).length;
  const confirmation = useMemo(
    () => submissionConfirmation(questions, answers),
    [questions, answers],
  );
  const progress = total ? ((index + 1) / total) * 100 : 0;
  const isLast = index === total - 1;
  const lowTime = secondsLeft <= 60;

  const flushSaves = useCallback(async () => {
    if (saveLoop.current) return saveLoop.current;

    saveLoop.current = (async () => {
      setSaving(true);
      try {
        while (pendingSaves.current.size > 0) {
          const batch = [...pendingSaves.current.entries()].map(([questionId, answer]) => ({
            question_id: questionId,
            answer,
          }));
          pendingSaves.current.clear();

          try {
            await saveDiagnosticAnswers({ attemptId, answers: batch });
            draftRef.current = clearSavedDraftAnswers(draftRef.current, batch);
            writeDraft(attemptId, draftRef.current);
            setSaveError(null);
          } catch (error) {
            for (const entry of batch) {
              if (!pendingSaves.current.has(entry.question_id)) {
                pendingSaves.current.set(entry.question_id, entry.answer);
              }
            }
            setSaveError(
              error instanceof AssessmentError
                ? error.message
                : "Your latest answer has not been saved yet.",
            );
            break;
          }
        }
      } finally {
        setSaving(false);
        saveLoop.current = null;
      }
    })();

    return saveLoop.current;
  }, [attemptId]);

  useEffect(() => {
    if (screen === "test" && attemptId && pendingSaves.current.size > 0) {
      void flushSaves();
    }
  }, [attemptId, flushSaves, screen]);

  const recordAnswer = useCallback(
    (questionId, answer) => {
      setAnswers((previous) => {
        const next = { ...previous, [questionId]: answer };
        answersRef.current = next;
        return next;
      });
      draftRef.current = { ...draftRef.current, [questionId]: String(answer ?? "") };
      writeDraft(attemptId, draftRef.current);
      pendingSaves.current.set(questionId, answer);
      setPendingSubmit(false);
      void flushSaves();
    },
    [attemptId, flushSaves],
  );

  const finish = useCallback(
    async (viaTimer = false) => {
      if (submissionStarted.current) return;

      submissionStarted.current = true;
      setSubmitting(true);
      setSubmitError(null);
      setAutoSubmitted(viaTimer);

      try {
        await flushSaves();
        const latestAnswers = answersRef.current;
        const response = await submitDiagnostic({
          attemptId,
          idempotencyKey: idempotencyKey.current,
          answers: questions.map((question) => ({
            question_id: question.id,
            answer: latestAnswers[question.id] ?? "",
          })),
        });

        clearIdempotencyKey(attemptId);
        clearDraft(attemptId);
        draftRef.current = {};
        pendingSaves.current.clear();
        setPendingSubmit(false);
        setResult(response);
        setScreen("report");
      } catch (error) {
        // Stay on the assessment so the learner can retry. Their answers remain
        // local and persisted answers can be restored after a reload.
        setSubmitError(
          error instanceof AssessmentError
            ? error.message
            : "We could not submit your assessment. Please try again.",
        );
      } finally {
        submissionStarted.current = false;
        setSubmitting(false);
      }
    },
    [attemptId, questions, flushSaves],
  );

  useEffect(() => {
    if (screen !== "test") return undefined;

    const onBeforeUnload = (event) => {
      if (pendingSaves.current.size === 0 && !saveLoop.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [screen]);

  useEffect(() => {
    if (screen !== "test") return undefined;

    const updateClock = () => {
      const next = remainingSeconds(deadline.current, timeLimitSeconds);
      setSecondsLeft(next);
      if (next === 0 && !timerSubmissionAttempted.current) {
        timerSubmissionAttempted.current = true;
        void finish(true);
      }
    };
    const ticker = window.setInterval(updateClock, 1000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") updateClock();
    };

    updateClock();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(ticker);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [screen, finish, timeLimitSeconds]);

  useEffect(() => {
    if (screen === "test" && scrollAnchor.current) {
      scrollAnchor.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [index, screen]);

  useEffect(() => {
    if (screen !== "test" || current?.type !== QUESTION_TYPE.MULTIPLE_CHOICE) {
      return undefined;
    }

    const onKey = (event) => {
      if (!current) return;

      const optionIndex = numericShortcutIndex(
        event,
        current.options.length,
        pendingSubmit || submitting,
      );
      if (optionIndex === null) return;

      const option = current.options[optionIndex];
      if (option) {
        event.preventDefault();
        recordAnswer(current.id, option.key);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, current, pendingSubmit, submitting, recordAnswer]);

  const beginAssessment = async () => {
    if (!assessment?.assessment_id || starting) return;

    setStarting(true);
    setLoadError(null);
    setLoadRefusal(null);
    try {
      const data = await startDiagnostic(assessment.assessment_id);
      setIndex(0);
      setPendingSubmit(false);
      setAutoSubmitted(false);
      setShowReview(false);
      setSubmitError(null);
      setResult(null);
      hydrateAttempt(data);
    } catch (error) {
      recordFailure(error, "We could not start your assessment. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  const selectOption = (optionKey) => {
    preserveScroll();
    if (current) recordAnswer(current.id, optionKey);
  };

  /**
   * Submitting, with the reader's place kept.
   *
   * Twice, because the render that matters lands after the await: a reading
   * taken on the click alone is spent on the one that only turned the spinner
   * on. The report that replaces the player is shorter than it, and without
   * this the browser clamps the offset and a learner who was reading the last
   * question is dropped at the top of a page they did not ask for.
   */
  const confirmSubmission = async () => {
    preserveScroll();
    try {
      await finish(false);
    } finally {
      preserveScroll();
    }
  };

  // A setter rather than a toggle: the review is a dialog now, and Radix
  // reports open and closed as a boolean. A toggle would flip the wrong way
  // the moment anything asked for a state it was already in.
  const changeReview = (next) => {
    preserveScroll();
    setShowReview(Boolean(next));
  };

  const goNext = () => {
    if (isLast) {
      setPendingSubmit(true);
      return;
    }
    setIndex((value) => Math.min(total - 1, value + 1));
  };

  const goPrevious = () => {
    setPendingSubmit(false);
    setIndex((value) => Math.max(0, value - 1));
  };

  const jumpTo = (target, { focusQuestion = false } = {}) => {
    reviewQuestionAfterClose.current = focusQuestion;
    setPendingSubmit(false);
    setIndex(target);
  };

  const cancelSubmission = () => {
    setPendingSubmit(false);
    window.requestAnimationFrame(() => finalSubmitTrigger.current?.focus());
  };

  const handleCloseAutoFocus = (event) => {
    event.preventDefault();
    if (reviewQuestionAfterClose.current) {
      reviewQuestionAfterClose.current = false;
      questionCard.current?.focus();
    } else {
      finalSubmitTrigger.current?.focus();
    }
  };

  if (invalidAttemptLink) {
    return (
      <CenteredNotice icon={AlertCircle} title="Invalid assessment link" tone="destructive">
        <p className="max-w-prose text-sm text-muted-foreground">
          This report link is incomplete or invalid. Open your assessment history to choose a
          valid report.
        </p>
        <Button asChild variant="outline">
          <Link href="/student/assessments">Return to assessments</Link>
        </Button>
      </CenteredNotice>
    );
  }

  // The first load, and only the first load: `loading` is set when the view
  // mounts and when a failed load is retried, and in both cases there is
  // nothing on screen to preserve. Starting an attempt, answering, moving
  // between questions and submitting all leave this alone.
  if (loading) {
    return <AssessmentPlayerSkeleton />;
  }

  if (loadError) {
    // A paper that is not ready, one this learner may not sit and one that is
    // not there are shown as themselves: their own heading, their own glyph,
    // and the plain shell colour rather than the marking-pen red, which is
    // reserved for something that actually went wrong. Every one of them used
    // to arrive as "Something went wrong", which reads to a child as MathSmart
    // breaking and as their own doing.
    const refusal = loadRefusal ?? startRefusal({});
    const Icon = REFUSAL_ICON[refusal.kind] ?? AlertCircle;

    return (
      <CenteredNotice
        icon={Icon}
        title={refusal.title}
        tone={refusal.isFault ? "destructive" : "muted"}
      >
        <p className="max-w-prose text-sm text-muted-foreground">{loadError}</p>
        {/* Wrapping, so the two controls sit side by side on a phone rather
            than stacking into a column of buttons. */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* Retrying something that is not there cannot help; retrying a
              paper a teacher is in the middle of finishing can. */}
          {refusal.kind !== REFUSAL.MISSING && (
            <Button variant="outline" onClick={retryLoad}>
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/student/assessments">Back to assessments</Link>
          </Button>
        </div>
      </CenteredNotice>
    );
  }

  if (screen !== "report" && !total) {
    return (
      <CenteredNotice icon={AlertCircle} title="No diagnostic items yet">
        <p className="max-w-prose text-sm text-muted-foreground">
          The question bank for your grade is empty. Please tell your teacher.
        </p>
      </CenteredNotice>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {screen === "intro" && (
        <DiagnosticIntro
          assessment={assessment}
          total={total}
          timeLimitSeconds={timeLimitSeconds}
          domains={domains}
          starting={starting}
          onBegin={beginAssessment}
        />
      )}

      {screen === "test" && current && (
        <DiagnosticPlayer
          assessmentTitle={assessment?.title}
          current={current}
          index={index}
          total={total}
          secondsLeft={secondsLeft}
          lowTime={lowTime}
          progress={progress}
          answeredCount={answeredCount}
          answers={answers}
          questions={questions}
          saving={saving}
          saveError={saveError}
          submitError={submitError}
          submitting={submitting}
          pendingSubmit={pendingSubmit}
          onOpenChangePendingSubmit={setPendingSubmit}
          confirmation={confirmation}
          isLast={isLast}
          onSelectOption={selectOption}
          onAnswerChange={recordAnswer}
          onPrevious={goPrevious}
          onNext={goNext}
          onJumpTo={jumpTo}
          onConfirmSubmit={confirmSubmission}
          onCancelSubmit={cancelSubmission}
          onReviewQuestion={(qIndex) => jumpTo(qIndex, { focusQuestion: true })}
          scrollAnchor={scrollAnchor}
          questionCard={questionCard}
          finalSubmitTrigger={finalSubmitTrigger}
          dialogInitialFocusRef={dialogInitialFocus}
          onCloseAutoFocus={handleCloseAutoFocus}
        />
      )}

      {screen === "report" && result && (
        <div ref={reportRegion} tabIndex={-1} className="outline-none">
          <DiagnosticResultsView
            result={result}
            assessmentTitle={assessment?.title}
            autoSubmitted={autoSubmitted}
            showReview={showReview}
            onShowReviewChange={changeReview}
          />
        </div>
      )}
    </div>
  );
}
