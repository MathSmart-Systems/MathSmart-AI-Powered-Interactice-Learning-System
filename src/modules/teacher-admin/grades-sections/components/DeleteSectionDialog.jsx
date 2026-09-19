"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The confirmation before a section is removed for good.
 *
 * Every other action in this workspace can be taken back: a deactivated
 * section can be activated again, a renamed one renamed back. This one cannot,
 * so it asks, it names the section it is about to remove, and its confirming
 * button says what will happen rather than "OK".
 *
 * The section is already retired by the time this can be reached — the row
 * offers no delete while it is live — so the sentence here is about
 * permanence, not about taking a class away from learners.
 */
export function DeleteSectionDialog({ section, open, onOpenChange, onConfirm, busy, error }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Delete this section?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{section?.name}</span> is deactivated.
            Deleting it removes the record from the school directory for good; there is no undo.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-foreground">
            Keep it deactivated instead if you may want it back, or if it is part of how this
            school year was organised.
          </p>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={busy}>
            <Trash2 aria-hidden="true" className="size-4" />
            {busy ? "Deleting…" : "Delete section"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
