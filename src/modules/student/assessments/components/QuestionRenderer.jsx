"use client";

import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QUESTION_TYPE } from "../services/diagnostic-service";
import { LETTERS } from "../utils/format";

export function QuestionRenderer({
  question,
  index = 0,
  value,
  onSelectOption,
  onAnswerChange,
}) {
  if (!question) return null;

  if (question.type === QUESTION_TYPE.MULTIPLE_CHOICE) {
    return (
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">
          Choose one answer for question {index + 1}
        </legend>
        {(question.options ?? []).map((option, optionIndex) => {
          const selected = value === option.key;

          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectOption?.(option.key)}
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
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={`answer-${question.id}`}>
        {question.type === QUESTION_TYPE.NUMBER_INPUT
          ? "Enter your numerical answer"
          : "Enter your answer"}
      </Label>
      <Input
        id={`answer-${question.id}`}
        type="text"
        inputMode={
          question.type === QUESTION_TYPE.NUMBER_INPUT ? "decimal" : "text"
        }
        autoComplete="off"
        value={value ?? ""}
        onChange={(event) => onAnswerChange?.(question.id, event.target.value)}
        className="h-11 text-base"
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        {question.type === QUESTION_TYPE.NUMBER_INPUT
          ? "You may use a whole number, decimal, or signed value."
          : "Type only the answer that completes the blank."}
      </p>
    </div>
  );
}
