"use client";

import { useActionState, useEffect, useId } from "react";
import { TriangleAlert } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { CONFIRM_ACTION_INITIAL_STATE } from "../action-state";
import { archiveQuestionAction } from "../services/actions";

import { SubmitButton } from "./SubmitButton";

/**
 * Two outcomes for the same form shape: a server action that puts the row in a
 * new status, and a cancel. Restoring does not need a second dialog because the
 * consequence of pressing restore is immediately understood.
 */
export function ArchiveQuestionDialog({ question, onOpenChange }) {
  const [state, formAction] = useActionState(archiveQuestionAction, CONFIRM_ACTION_INITIAL_STATE);
  const formId = useId();

  useEffect(() => {
    if (state.success) {
      onOpenChange(false);
    }
  }, [state.success, onOpenChange]);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Archive question</DialogTitle>
          <DialogDescription>
            An archived question disappears from activities and assessments and can no longer be
            given to learners. Anything the learner already answered keeps its score.
          </DialogDescription>
        </DialogHeader>

        {state.formError ? (
          <p
            role="alert"
            className="flex items-start gap-2.5 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{state.formError}</span>
          </p>
        ) : null}

        <form id={formId} action={formAction}>
          <input type="hidden" name="id" value={question.id} />

          <p className="max-w-prose text-sm leading-relaxed text-foreground">
            Archive <span className="font-semibold text-foreground">{question.prompt}</span>?
          </p>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Keep question
          </Button>
          <SubmitButton form={formId} label="Archive question" pendingLabel="Archiving…" variant="destructive" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}