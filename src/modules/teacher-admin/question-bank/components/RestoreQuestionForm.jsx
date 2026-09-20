"use client";

import { useActionState } from "react";
import { ArchiveRestore } from "lucide-react";

import { CONFIRM_ACTION_INITIAL_STATE } from "../action-state";
import { restoreQuestionAction } from "../services/actions";

import { SubmitButton } from "./SubmitButton";

/**
 * The restore control on an archived row.
 *
 * It runs through `useActionState` rather than being bound straight to the
 * form. A plain `<form action>` throws the action's return value away, so a
 * refused restore — an expired session, a competency that has since been
 * archived, a service that is down — left the row exactly as it was and told
 * the teacher nothing at all.
 */
export function RestoreQuestionForm({ question }) {
  const [state, formAction] = useActionState(restoreQuestionAction, CONFIRM_ACTION_INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1.5">
      <input type="hidden" name="id" value={question.id} />
      <SubmitButton
        variant="outline"
        size="sm"
        className="gap-1.5"
        label={
          <>
            <ArchiveRestore aria-hidden="true" className="size-4" />
            Restore<span className="sr-only">{question.prompt}</span>
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
