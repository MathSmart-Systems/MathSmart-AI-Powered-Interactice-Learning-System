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
 */
export function RestoreModuleForm({ module }) {
  const [state, formAction] = useActionState(restoreModuleAction, CONFIRM_ACTION_INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1.5">
      <input type="hidden" name="id" value={module.id} />
      <SubmitButton
        variant="ghost"
        size="icon-sm"
        label={
          <>
            <ArchiveRestore aria-hidden="true" className="size-4" />
            <span className="sr-only">Restore module</span>
          </>
        }
        pendingLabel="Restoring…"
      />

      {state.formError ? (
        <p role="alert" className="max-w-56 text-xs text-destructive">
          {state.formError}
        </p>
      ) : null}
    </form>
  );
}