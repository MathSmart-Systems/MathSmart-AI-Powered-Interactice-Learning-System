"use client";

import { useActionState, useId } from "react";
import { CheckCircle2 } from "lucide-react";

import { CONFIRM_ACTION_INITIAL_STATE } from "../action-state";
import { publishModuleAction } from "../services/actions";
import { modulePublishBlockers } from "../utils/publish-readiness";

import { SubmitButton } from "./SubmitButton";

/**
 * The one-tap publish control on a draft row.
 *
 * A draft that is already finished used to have to be reopened in the author
 * dialog and saved again with its status changed, which is a lot of ceremony
 * for a decision the teacher has already made.
 *
 * What stands in the way is said here, beside the button, rather than left to
 * be discovered by pressing it. The button stays enabled anyway: a disabled
 * control tells a keyboard or screen-reader user nothing about why, and the
 * refusal it produces is more precise than the hint — it is checked against
 * the module the server holds rather than the row on screen.
 */
export function PublishModuleForm({ module }) {
  const [state, formAction] = useActionState(publishModuleAction, CONFIRM_ACTION_INITIAL_STATE);
  const hintId = useId();

  const blockers = modulePublishBlockers({
    rules: module.rules,
    workedExamples: module.workedExamples,
    competencyStatus: module.competencyStatus,
  });

  return (
    <form action={formAction} className="flex flex-col items-start gap-1.5">
      <input type="hidden" name="id" value={module.id} />
      <SubmitButton
        size="sm"
        className="gap-1.5"
        aria-describedby={blockers.length > 0 ? hintId : undefined}
        label={
          <>
            <CheckCircle2 aria-hidden="true" className="size-4" />
            Publish<span className="sr-only">{module.title}</span>
          </>
        }
        pendingLabel="Publishing…"
      />

      {blockers.length > 0 ? (
        <p id={hintId} className="max-w-56 text-xs text-muted-foreground">
          {blockers.join(" ")}
        </p>
      ) : null}

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
