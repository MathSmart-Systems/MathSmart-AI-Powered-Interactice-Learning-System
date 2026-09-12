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

import { archiveActivity } from "../services/activity-admin-service.js";

/**
 * The archive confirmation body and actions.
 *
 * Separated from the dialog shell so that opening the dialog or switching rows
 * mounts it fresh: errors and archiving flags never leak across reopenings.
 */
function ArchiveDialogContent({ activity, onClose, onArchived }) {
  const [isArchiving, setIsArchiving] = useState(false);
  const [error, setError] = useState(null);

  async function handleArchive() {
    setIsArchiving(true);
    setError(null);

    const result = await archiveActivity(activity.activity_id);
    setIsArchiving(false);

    if (result.ok) {
      onArchived(activity);
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
            {error}
          </p>
        ) : null}

        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Archiving &ldquo;{activity.title}&rdquo; will withdraw it from active learner practice.
          Past student attempts and progress records are preserved for historical reporting.
          An archived activity cannot be republished — create a new draft instead.
        </p>
      </DialogBody>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-5"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="h-11 px-5"
          disabled={isArchiving || !activity}
          onClick={handleArchive}
        >
          {isArchiving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          Archive Activity
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Confirming that an activity is withdrawn.
 */
export function ActivityArchiveDialog({ open, onOpenChange, onArchived, activity }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Archive activity</DialogTitle>
          <DialogDescription>
            Withdraw this activity from student learning paths.
          </DialogDescription>
        </DialogHeader>

        {open && activity ? (
          <ArchiveDialogContent
            key={activity.activity_id}
            activity={activity}
            onClose={() => onOpenChange(false)}
            onArchived={(archived) => {
              onOpenChange(false);
              onArchived?.(archived);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
