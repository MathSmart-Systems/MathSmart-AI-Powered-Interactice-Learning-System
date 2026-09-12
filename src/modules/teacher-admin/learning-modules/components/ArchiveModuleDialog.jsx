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
import { archiveModuleAction } from "../services/actions";

import { SubmitButton } from "./SubmitButton";

/**
 * Two outcomes for the same form shape: a server action that puts the row in
 * the archived state, and a cancel. Restoring does not need a second dialog
 * because the consequence of pressing restore is immediately understood.
 */
export function ArchiveModuleDialog({ module, onOpenChange }) {
  const [state, formAction] = useActionState(archiveModuleAction, CONFIRM_ACTION_INITIAL_STATE);
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
          <DialogTitle>Archive module</DialogTitle>
          <DialogDescription>
            An archived module disappears from the learner path and can no longer be given to
            learners. Records of anyone who already studied it stay intact.
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
          <input type="hidden" name="id" value={module.id} />

          <p className="max-w-prose text-sm leading-relaxed text-foreground">
            Archive <span className="font-semibold text-foreground">{module.title}</span>?
          </p>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Keep module
          </Button>
          <SubmitButton form={formId} label="Archive module" pendingLabel="Archiving…" variant="destructive" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}