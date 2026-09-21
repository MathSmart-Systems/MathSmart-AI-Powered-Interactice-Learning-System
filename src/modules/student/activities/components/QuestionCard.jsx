"use client";

import { CheckCircle2, Lightbulb, Sparkles, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { QUESTION_TYPE } from "../utils/activities-model.js";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/**
 * One activity question and the learner's controls for it.
 *
 * The checked state comes from the deterministic answer check: a correct
 * selection tints pine green with a checkmark, a wrong one marking-pen red with
 * a cross — each with the verdict written out below in the feedback panel.
 *
 * `hint` is the hint a teacher authored. `aiHint` is an optional rephrasing of
 * that same hint, shown under its own label and never in its place, so a
 * learner can always tell which words came from their teacher.
 */
export function QuestionCard({
  question,
  value = "",
  check = null,
  hint = null,
  aiHint = null,
  hintState = "idle",
  hintError = null,
  checking = false,
  onSelectOption,
  onChangeValue,
  onToggleHint,
}) {
  if (!question) return null;

  const isChecked = check !== null;
  const isCorrect = check?.isCorrect === true;
  const selected = value !== undefined && value !== null ? String(value) : "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        {question.visualAidDescription && (
          <p className="text-xs font-medium text-muted-foreground">
            Use the diagram shown with this question.
          </p>
        )}
        <h2 className="font-display text-balance text-2xl font-semibold leading-snug text-foreground">
          {question.text}
        </h2>
      </div>

      {question.type === QUESTION_TYPE.MULTIPLE_CHOICE ? (
        <fieldset className="flex flex-col gap-3" disabled={isChecked && isCorrect}>
          <legend className="sr-only">Choose one answer</legend>
          {(question.options ?? []).map((option, optionIndex) => {
            const isSelected = selected === option.key;
            const isChoiceWrongPick = isChecked && isSelected && !isCorrect;

            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={isSelected}
                disabled={isChecked && isCorrect}
                onClick={() => onSelectOption?.(option.key)}
                className={`flex w-full items-center gap-4 border px-4 py-4 text-left transition duration-200 ease-out disabled:opacity-90 ${
                  isSelected
                    ? isChoiceWrongPick
                      ? "border-destructive bg-destructive/5 text-foreground"
                      : "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary"
                }`}
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-md border text-sm font-semibold transition-colors duration-200 ${
                    isSelected
                      ? isChoiceWrongPick
                        ? "border-destructive bg-destructive text-destructive-foreground"
                        : "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {LETTERS[optionIndex] ?? optionIndex + 1}
                </span>
                <span className="text-base leading-relaxed">{option.label}</span>
                {isSelected && isChecked && (
                  <span className="ml-auto">
                    {isCorrect ? (
                      <CheckCircle2 aria-hidden="true" className="size-5 text-primary" />
                    ) : (
                      <XCircle aria-hidden="true" className="size-5 text-destructive" />
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </fieldset>
      ) : (
        <div className="flex max-w-md flex-col gap-3">
          <Label htmlFor={`activity-answer-${question.id}`}>
            {question.type === QUESTION_TYPE.NUMBER_INPUT
              ? "Enter your calculated answer"
              : question.type === QUESTION_TYPE.FILL_BLANK
                ? "Type the word that completes the sentence"
                : "Enter your answer"}
          </Label>
          <Input
            id={`activity-answer-${question.id}`}
            type="text"
            inputMode={question.type === QUESTION_TYPE.NUMBER_INPUT ? "decimal" : "text"}
            autoComplete="off"
            value={selected}
            disabled={isChecked && isCorrect}
            onChange={(event) => onChangeValue?.(event.target.value)}
            className="h-11 text-base"
            aria-invalid={isChecked && !isCorrect ? "true" : undefined}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {question.type === QUESTION_TYPE.NUMBER_INPUT
              ? "You may use a whole number, decimal, or signed value."
              : "Check your answer when you are ready — you can try again if it is not right yet."}
          </p>
        </div>
      )}

      <div className="border-t border-border pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-sm text-muted-foreground"
          onClick={onToggleHint}
          disabled={hintState === "loading"}
        >
          <Lightbulb aria-hidden="true" className="size-4" />
          {hintState === "loading" ? "Finding a hint…" : hint ? "Hint" : "Need a hint?"}
        </Button>

        {/*
          A learner who asked for help and got an error needs to know what to do
          next, not that something went wrong. Both of these say what happened
          in one short sentence and then give a next step that works: the hint
          is optional, and the question can still be answered and checked
          without it.
        */}
        {hintState === "error" && (
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">
            {hintError ?? "The hint did not arrive."} Tap “Need a hint?” to ask
            again. You can also answer the question and press “Check answer” —
            you can try as many times as you need.
          </p>
        )}

        {hintState === "none" && (
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">
            There is no hint written for this question. Read it again slowly,
            write the answer you think is right, then check it — a wrong answer
            comes with an explanation you can use.
          </p>
        )}

        {hint && (
          <div className="mt-3 flex items-start gap-2.5 border border-border bg-secondary/50 px-4 py-3">
            <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm leading-relaxed text-foreground">{hint}</p>
          </div>
        )}

        {/*
          The same hint in other words. It sits outside the hint's own panel, in
          a dashed outline and under its own label, so that the difference from
          the authored hint is carried by the wording and the shape rather than
          by a tint a learner could miss.
        */}
        {hint && aiHint && (
          <div className="mt-2 flex items-start gap-2.5 border border-dashed border-border bg-background px-4 py-3">
            <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Optional AI help
              </p>
              <p className="text-sm leading-relaxed text-foreground">{aiHint}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Another way of saying the hint above. It is a suggestion, not a
                grade, and it changes nothing about your answer.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}