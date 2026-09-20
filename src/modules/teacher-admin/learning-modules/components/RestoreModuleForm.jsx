"use client";

import { useActionState } from "react";
import { ArchiveRestore } from "lucide-react";

import { CONFIRM_ACTION_INITIAL_STATE } from "../action-state";
import { restoreModuleAction } from "../services/actions";

import { SubmitButton } from "./SubmitButton";

/**
 * The one-tap restore control on an archived row. Unlike the dialogs this is a
 * plain form on the row, so the action's outcome is shown here: a failed
 * restore would otherwise leave the row archived with no feedback at all.
 *
 * A successful restore can also have something to say. Archiving frees the
 * module's place in its competency, so by the time anybody restores it another
 * module has usually taken that place and this one comes back at the end
 * instead. That changes the order learners work through, so the row says so.
 */
export function RestoreModuleForm({ module }) {
  const [state, formAction] = useActionState(restoreModuleAction, CONFIRM_ACTION_INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1.5">
      <input type="hidden" name="id" value={module.id} />
      <SubmitButton
        variant="outline"
        size="sm"
        className="gap-1.5"
        label={
          <>
            <ArchiveRestore aria-hidden="true" className="size-4" />
            Restore
            <span className="sr-only"> module</span>
          </>
        }
        pendingLabel="Restoring…"
      />

      {state.formError ? (
        <p role="alert" className="max-w-56 text-xs text-destructive">
          {state.formError}
        </p>
      ) : null}

      {state.notice ? (
        <p role="status" className="max-w-56 text-xs text-muted-foreground">
          {state.notice}
        </p>
      ) : null}
    </form>
  );
}
