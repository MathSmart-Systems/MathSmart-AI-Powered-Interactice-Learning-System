"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

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

import { restoreActivity } from "../services/activity-admin-service.js";

/** The restore body and actions, mounted fresh per row. */
function RestoreDialogContent({ activity, onClose, onRestored }) {
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState(null);

  async function handleRestore() {
    setIsRestoring(true);
    setError(null);

    const result = await restoreActivity(activity.activity_id);
    setIsRestoring(false);

    if (result.ok) {
      onRestored(result.data ?? activity);
      return;
    }
    setError(result.error);
  }

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        {error ? (
          <p
            role="alert"
            className="flex gap-2 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-foreground"
          >
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-destructive"
            />
            <span className="min-w-0 break-words">{error}</span>
          </p>
        ) : null}

        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          &ldquo;{activity.title}&rdquo; comes back as a draft, so nothing reaches learners until
          you publish it again. Its questions and every past attempt are kept exactly as they
          are.
        </p>
      </DialogBody>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-5"
          disabled={isRestoring}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="h-11 px-5"
          disabled={isRestoring}
          onClick={handleRestore}
        >
          {isRestoring ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          {isRestoring ? "Restoring…" : "Restore as draft"}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Bringing an archived activity back.
 *
 * There was no way to do this. The archive dialog said an archived activity
 * "cannot be republished — create a new draft instead", which was never true:
 * the route has always accepted a status, and the only way to find that out was
 * to open the edit form on an archived row and change the dropdown.
 */
export function ActivityRestoreDialog({ open, onOpenChange, onRestored, activity }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Restore activity</DialogTitle>
          <DialogDescription>Bring this activity back as a draft.</DialogDescription>
        </DialogHeader>

        {open && activity ? (
          <RestoreDialogContent
            key={activity.activity_id}
            activity={activity}
            onClose={() => onOpenChange(false)}
            onRestored={onRestored}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
