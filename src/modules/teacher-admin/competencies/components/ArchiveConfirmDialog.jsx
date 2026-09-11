"use client";

import { useActionState, useEffect } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Archive, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import { archiveCompetencyAction } from "../actions/competencies";

/**
 * The confirmation before a competency leaves the live curriculum.
 *
 * Archiving keeps the row — learner history still points at it — so the dialog
 * says exactly that instead of promising a deletion. The action is the archive
 * endpoint, marked in the marking-pen red because it takes a lesson out of
 * learners' view, and it needs the person's explicit second decision.
 */
export function ArchiveConfirmDialog({
  trigger,
  open,
  onOpenChange,
  competency,
  onSaved,
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 outline-none">
          <div className="rounded-lg border border-border bg-card p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <DialogPrimitive.Title className="font-display text-xl font-semibold tracking-tight text-foreground">
                  Archive competency?
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{competency?.name}</span>{" "}
                  leaves the live curriculum, but learners keep the history they
                  already recorded against it.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Close dialog">
                  <X aria-hidden="true" />
                </Button>
              </DialogPrimitive.Close>
            </div>

            {competency ? <ArchiveForm competency={competency} onSaved={onSaved} /> : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ArchiveForm({ competency, onSaved }) {
  const [state, formAction, isPending] = useActionState(archiveCompetencyAction, {
    ok: false,
  });

  useEffect(() => {
    if (state?.ok) {
      onSaved();
    }
  }, [state, onSaved]);

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-5">
      <input type="hidden" name="competency_id" value={competency.id} />

      {state?.ok === false && state.error ? (
        <div
          role="alert"
          className="flex flex-col gap-1 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3"
        >
          <p className="text-sm font-medium text-destructive">Not archived yet</p>
          <p className="text-sm leading-relaxed text-foreground">{state.error.message}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3">
        <DialogPrimitive.Close asChild>
          <Button type="button" variant="outline" className="h-11 px-5">
            Keep it live
          </Button>
        </DialogPrimitive.Close>
        <Button type="submit" variant="destructive" className="h-11 px-5" disabled={isPending}>
          <Archive aria-hidden="true" className="size-4" />
          {isPending ? "Archiving…" : "Archive competency"}
        </Button>
      </div>
    </form>
  );
}