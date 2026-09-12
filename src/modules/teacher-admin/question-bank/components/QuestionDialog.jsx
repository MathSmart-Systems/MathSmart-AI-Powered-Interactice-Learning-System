"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { Minus, Plus, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { QUESTION_DIALOG_MODES, QUESTION_FORM_INITIAL_STATE } from "../action-state";
import { DIFFICULTY_OPTIONS, QUESTION_TYPES, STATUS_OPTIONS } from "../constants";
import { createQuestionAction, updateQuestionAction } from "../services/actions";

import { SubmitButton } from "./SubmitButton";

/**
 * The one decorative gradient token a native <select> shares with the Input
 * primitive, kept here so the author form never sprinkles raw theme values.
 */
const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 md:text-sm";

function Field({ id, label, error, hint, required = false, children }) {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className={required ? "after:ml-0.5 after:text-destructive after:content-['*']" : undefined}>
        {label}
      </Label>
      {children}
      {hint ? <p className="text-sm leading-relaxed text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ChoiceEditor({ choices, onChange, error }) {
  const addId = useId();

  return (
    <div className="flex flex-col gap-2" aria-describedby={error ? `${addId}-error` : undefined}>
      <Label className="after:ml-0.5 after:text-destructive after:content-['*']">
        Choices
      </Label>

      <ul className="flex flex-col gap-2">
        {choices.map((choice, index) => (
          <li key={index} className="flex items-center gap-2">
            <Input
              name="choice"
              value={choice}
              onChange={(event) => {
                const next = choices.slice();
                next[index] = event.target.value;
                onChange(next);
              }}
              aria-label={`Choice ${index + 1}`}
              className="flex-1"
            />
            {choices.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove choice ${index + 1}`}
                onClick={() => onChange(choices.filter((_, i) => i !== index))}
              >
                <Minus aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...choices, ""])}
      >
        <Plus aria-hidden="true" className="size-4" />
        Add another choice
      </Button>

      {error ? (
        <p id={`${addId}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The create or edit author form, one dialog for both. The answer key is
 * write-only by column grant, so an edit opens with every field filled except
 * the parts that can never be read back: key, explanation and hint are not
 * shown — the teacher re-enters them, and the form says so.
 */
export function QuestionDialog({ mode, question, competencies, onOpenChange }) {
  const isEdit = mode === QUESTION_DIALOG_MODES.EDIT;
  const action = isEdit ? updateQuestionAction : createQuestionAction;
  const [state, formAction] = useActionState(action, QUESTION_FORM_INITIAL_STATE);

  const [choices, setChoices] = useState(() =>
    isEdit && Array.isArray(question?.choices) && question.choices.length > 0
      ? question.choices.map((choice) => String(choice))
      : [""],
  );
  const [status, setStatus] = useState(() =>
    question?.status === "published" ? "published" : "draft",
  );
  const [questionType, setQuestionType] = useState(() =>
    isEdit ? (question?.questionType ?? "multiple_choice") : "multiple_choice",
  );

  const formId = useId();
  const competencyError = state.fieldErrors?.competency_id ?? null;
  const typeError = state.fieldErrors?.question_type ?? null;
  const difficultyError = state.fieldErrors?.difficulty ?? null;
  const promptError = state.fieldErrors?.prompt ?? null;
  const choicesError = state.fieldErrors?.choices ?? null;
  const keyError = state.fieldErrors?.answer_key ?? null;

  useEffect(() => {
    if (state.success) {
      onOpenChange(false);
    }
  }, [state.success, onOpenChange]);

  const answering = status === "published" ? "Publish question" : "Save draft";
  const answeringPending = status === "published" ? "Publishing…" : "Saving…";

  const TYPE_HELP = {
    multiple_choice: "Learners pick one of the choices below.",
    number_input: "Learners type a plain number.",
    fill_blank: "Learners type the missing word or number.",
  };
  const typeHelp = TYPE_HELP[questionType];

  const PROMPT_HINT = {
    number_input: "Ask for a plain number — no units, no words.",
    fill_blank: "Mark the blank in the question text, for example with ___.",
  };
  const promptHint = PROMPT_HINT[questionType];

  const ANSWER_FIELD = {
    multiple_choice: {
      label: "Correct answer",
      placeholder: "e.g. the exact text of one choice",
      inputMode: "text",
      hint: "Must match one of the choices exactly. Never shown back after saving.",
    },
    number_input: {
      label: "Correct answer",
      placeholder: "e.g. 24",
      inputMode: "decimal",
      hint: "A plain number without units. Never shown back after saving.",
    },
    fill_blank: {
      label: "Expected answer",
      placeholder: "e.g. 12",
      inputMode: "text",
      hint: "The exact text the blank expects. Never shown back after saving.",
    },
  }[questionType];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit question" : "New question"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Only the readable fields come back. The answer key — and any explanation or hint you saved — is write-only and is never returned, so it always starts blank here. Re-enter the key to save this edit; optional fields you leave blank keep what is already stored."
              : "A question is held as a draft until you publish it. Publishing makes it available to use in activities and assessments."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-5">
          {isEdit ? <input type="hidden" name="id" value={question.id} /> : null}

          {state.formError ? (
            <p
              role="alert"
              className="flex items-start gap-2.5 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{state.formError}</span>
            </p>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id={`${formId}-competency`}
              label="Competency"
              required
              error={competencyError}
            >
              <select
                id={`${formId}-competency`}
                name="competency_id"
                defaultValue={isEdit ? (question.competencyId ?? "") : ""}
                required
                aria-invalid={competencyError ? true : undefined}
                className={SELECT_CLASS}
              >
                <option value="" disabled>
                  Choose a competency
                </option>
                {competencies.map((competency) => (
                  <option key={competency.id} value={competency.id}>
                    {competency.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              id={`${formId}-type`}
              label="Question type"
              required
              error={typeError}
              hint={typeHelp}
            >
              <select
                id={`${formId}-type`}
                name="question_type"
                value={questionType}
                onChange={(event) => setQuestionType(event.target.value)}
                required
                aria-invalid={typeError ? true : undefined}
                className={SELECT_CLASS}
              >
                {QUESTION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field id={`${formId}-difficulty`} label="Difficulty" required error={difficultyError}>
              <select
                id={`${formId}-difficulty`}
                name="difficulty"
                defaultValue={isEdit ? (question.difficulty ?? "medium") : "medium"}
                required
                aria-invalid={difficultyError ? true : undefined}
                className={SELECT_CLASS}
              >
                {DIFFICULTY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field id={`${formId}-status`} label="Status" required>
              <select
                id={`${formId}-status`}
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className={SELECT_CLASS}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            id={`${formId}-prompt`}
            label="Question text"
            required
            error={promptError}
            hint={promptHint}
          >
            <Textarea
              id={`${formId}-prompt`}
              name="prompt"
              defaultValue={isEdit ? (question.prompt ?? "") : ""}
              required
              minLength={2}
              rows={4}
              aria-invalid={promptError ? true : undefined}
              className="min-h-24"
            />
          </Field>

          <Field id={`${formId}-visual-aid`} label="Visual aid description" hint="Describe a drawing or image that should appear with the question, or leave it blank.">
            <Textarea
              id={`${formId}-visual-aid`}
              name="visual_aid_description"
              defaultValue={isEdit ? (question.visualAid ?? "") : ""}
              rows={2}
              className="min-h-16"
            />
          </Field>

          {questionType === "multiple_choice" ? (
            <ChoiceEditor choices={choices} onChange={setChoices} error={choicesError} />
          ) : null}

          <Field
            id={`${formId}-key`}
            label={ANSWER_FIELD.label}
            required
            error={keyError}
            hint={ANSWER_FIELD.hint}
          >
            <Input
              id={`${formId}-key`}
              name="answer_key"
              type="text"
              inputMode={ANSWER_FIELD.inputMode}
              defaultValue=""
              required
              placeholder={ANSWER_FIELD.placeholder}
              aria-invalid={keyError ? true : undefined}
              className="bg-card"
            />
          </Field>

          <Field
            id={`${formId}-explanation`}
            label="Answer explanation"
            hint="Shown to a learner after they answer, to make the working clear."
          >
            <Textarea
              id={`${formId}-explanation`}
              name="explanation"
              defaultValue=""
              rows={3}
              className="min-h-20"
            />
          </Field>

          <Field id={`${formId}-hint`} label="Hint" hint="Optional clue, shown only if a learner asks for one.">
            <Textarea
              id={`${formId}-hint`}
              name="hint"
              defaultValue=""
              rows={2}
              className="min-h-16"
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <SubmitButton label={answering} pendingLabel={answeringPending} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}