"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
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
import { formatClock } from "../utils/format";
import { QuestionRenderer } from "./QuestionRenderer";
import { QuestionNavigator } from "./QuestionNavigator";
import { SubmissionConfirmModal } from "./SubmissionConfirmModal";

export function DiagnosticPlayer({
  current,
  index = 0,
  total = 0,
  secondsLeft = 0,
  lowTime = false,
  progress = 0,
  answeredCount = 0,
  answers = {},
  questions = [],
  saving = false,
  saveError = null,
  submitError = null,
  submitting = false,
  pendingSubmit = false,
  onOpenChangePendingSubmit,
  confirmation,
  isLast = false,
  onSelectOption,
  onAnswerChange,
  onPrevious,
  onNext,
  onJumpTo,
  onConfirmSubmit,
  onCancelSubmit,
  onReviewQuestion,
  scrollAnchor,
  questionCard,
  finalSubmitTrigger,
  dialogInitialFocusRef,
  onCloseAutoFocus,
}) {
  if (!current) return null;

  return (
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

      <Card ref={questionCard} tabIndex={-1} className="outline-none">
        <CardHeader className="gap-3">
          <CardDescription>{current.domain}</CardDescription>
          <CardTitle className="max-w-prose text-xl leading-snug font-medium">
            {current.prompt}
          </CardTitle>
        </CardHeader>

        <CardContent>
          <QuestionRenderer
            question={current}
            index={index}
            value={answers[current.id]}
            onSelectOption={onSelectOption}
            onAnswerChange={onAnswerChange}
          />
        </CardContent>

        <CardFooter className="flex flex-col gap-5 border-t border-border pt-6">
          {(saving || saveError) && (
            <p
              role={saveError ? "alert" : "status"}
              className={`flex w-full items-start gap-3 border-l-[3px] px-4 py-3 text-sm text-foreground ${
                saveError
                  ? "border-destructive bg-destructive/5"
                  : "border-primary bg-primary/5"
              }`}
            >
              {saveError ? (
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                />
              ) : (
                <RefreshCw
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 animate-spin text-primary"
                />
              )}
              <span>
                {saveError
                  ? `${saveError} Your answer remains on this page; change it or continue to retry saving.`
                  : "Saving your latest answer…"}
              </span>
            </p>
          )}

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
                {submitError} Your answers remain available — press submit again
                to retry.
              </span>
            </p>
          )}

          <SubmissionConfirmModal
            open={pendingSubmit}
            onOpenChange={onOpenChangePendingSubmit}
            confirmation={confirmation}
            submitting={submitting}
            onConfirm={onConfirmSubmit}
            onCancel={onCancelSubmit}
            onReviewQuestion={onReviewQuestion}
            dialogInitialFocusRef={dialogInitialFocusRef}
            onCloseAutoFocus={onCloseAutoFocus}
          />

          <div className="flex w-full items-center justify-between gap-4">
            <Button variant="outline" onClick={onPrevious} disabled={index === 0}>
              <ArrowLeft aria-hidden="true" />
              Previous
            </Button>

            <Button
              ref={isLast ? finalSubmitTrigger : undefined}
              data-testid={isLast ? "final-submit-trigger" : undefined}
              onClick={onNext}
              disabled={submitting}
            >
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

      <QuestionNavigator
        questions={questions}
        currentIndex={index}
        answers={answers}
        onJumpTo={onJumpTo}
      />
    </section>
  );
}
