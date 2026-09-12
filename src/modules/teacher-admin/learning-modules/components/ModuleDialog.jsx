"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { TriangleAlert } from "lucide-react";

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

import { MODULE_DIALOG_MODES, MODULE_FORM_INITIAL_STATE } from "../action-state";
import { MAX_ESTIMATED_MINUTES, MIN_ESTIMATED_MINUTES, STATUS_OPTIONS } from "../constants";
import { createModuleAction, updateModuleAction } from "../services/actions";
import {
  blankExample,
  blankRule,
  normalizeExample,
  normalizeRule,
} from "../utils/module-form";

import { RulesEditor } from "./RulesEditor";
import { SubmitButton } from "./SubmitButton";
import { WorkedExamplesEditor } from "./WorkedExamplesEditor";

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

/**
 * The create or edit author form, one dialog for both. Every module field is
 * readable, so an edit opens with the stored content. Publishing a module puts
 * it on the learner path, which is why the form asks for at least one complete
 * rule and one worked example before an author can publish.
 */
export function ModuleDialog({ mode, module, competencies, onOpenChange }) {
  const isEdit = mode === MODULE_DIALOG_MODES.EDIT;
  const action = isEdit ? updateModuleAction : createModuleAction;
  const [state, formAction] = useActionState(action, MODULE_FORM_INITIAL_STATE);

  const [rules, setRules] = useState(() =>
    isEdit && Array.isArray(module?.rules) && module.rules.length > 0
      ? module.rules.map(normalizeRule)
      : [blankRule()],
  );
  const [workedExamples, setWorkedExamples] = useState(() =>
    isEdit && Array.isArray(module?.workedExamples) && module.workedExamples.length > 0
      ? module.workedExamples.map(normalizeExample)
      : [blankExample()],
  );
  const [status, setStatus] = useState(() =>
    module?.status === "published" ? "published" : "draft",
  );

  const formId = useId();
  const competencyError = state.fieldErrors?.competency_id ?? null;
  const titleError = state.fieldErrors?.title ?? null;
  const orderError = state.fieldErrors?.order_index ?? null;
  const minutesError = state.fieldErrors?.estimated_minutes ?? null;
  const objectiveError = state.fieldErrors?.learning_objective ?? null;
  const explanationError = state.fieldErrors?.short_explanation ?? null;
  const rulesError = state.fieldErrors?.rules ?? null;
  const examplesError = state.fieldErrors?.worked_examples ?? null;

  useEffect(() => {
    if (state.success) {
      onOpenChange(false);
    }
  }, [state.success, onOpenChange]);

  const answering = status === "published" ? "Publish module" : "Save draft";
  const answeringPending = status === "published" ? "Publishing…" : "Saving…";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit module" : "New module"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Every part of a module can be read back, so this form opens with what is stored. Saving rewrites the module with the values on this form."
              : "A module is held as a draft until you publish it. Publishing puts it on the learner path, so a published module needs at least one complete core rule and one worked example."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-5">
          {isEdit ? <input type="hidden" name="id" value={module.id} /> : null}

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
                defaultValue={isEdit ? (module.competencyId ?? "") : ""}
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
            id={`${formId}-title`}
            label="Module title"
            required
            error={titleError}
          >
            <Input
              id={`${formId}-title`}
              name="title"
              defaultValue={isEdit ? (module.title ?? "") : ""}
              required
              minLength={2}
              maxLength={300}
              placeholder="e.g. Multiplying Rational Numbers"
              aria-invalid={titleError ? true : undefined}
              className="bg-card"
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id={`${formId}-minutes`}
              label="Study time (minutes)"
              required
              error={minutesError}
              hint={`How long a learner should spend on this module, from ${MIN_ESTIMATED_MINUTES} to ${MAX_ESTIMATED_MINUTES}.`}
            >
              <Input
                id={`${formId}-minutes`}
                name="estimated_minutes"
                type="number"
                defaultValue={isEdit ? (module.estimatedMinutes ?? "") : ""}
                required
                min={MIN_ESTIMATED_MINUTES}
                max={MAX_ESTIMATED_MINUTES}
                aria-invalid={minutesError ? true : undefined}
                className="bg-card"
              />
            </Field>

            <Field
              id={`${formId}-order`}
              label="Order in the learning path"
              required
              error={orderError}
              hint="Where this module sits among the modules of its competency. Lower numbers come first."
            >
              <Input
                id={`${formId}-order`}
                name="order_index"
                type="number"
                defaultValue={isEdit ? (module.orderIndex ?? "") : ""}
                required
                min={0}
                aria-invalid={orderError ? true : undefined}
                className="bg-card"
              />
            </Field>
          </div>

          <Field
            id={`${formId}-objective`}
            label="Learning objective"
            required
            error={objectiveError}
          >
            <Textarea
              id={`${formId}-objective`}
              name="learning_objective"
              defaultValue={isEdit ? (module.learningObjective ?? "") : ""}
              required
              minLength={2}
              rows={3}
              placeholder="State the measurable objective the learner reaches by the end of this module."
              aria-invalid={objectiveError ? true : undefined}
              className="min-h-20"
            />
          </Field>

          <Field
            id={`${formId}-explanation`}
            label="Short explanation"
            required
            error={explanationError}
          >
            <Textarea
              id={`${formId}-explanation`}
              name="short_explanation"
              defaultValue={isEdit ? (module.shortExplanation ?? "") : ""}
              required
              minLength={2}
              rows={2}
              placeholder="A learner-friendly introduction to this module."
              aria-invalid={explanationError ? true : undefined}
              className="min-h-16"
            />
          </Field>

          <RulesEditor rules={rules} onChange={setRules} error={rulesError} />

          <WorkedExamplesEditor
            examples={workedExamples}
            onChange={setWorkedExamples}
            error={examplesError}
          />

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