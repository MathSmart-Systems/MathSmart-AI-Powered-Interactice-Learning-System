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

import { archiveAssessment } from "../services/assessment-admin-service.js";

/**
 * The archive confirmation body and actions.
 *
 * Separated from the dialog shell so that opening the dialog or switching rows
 * mounts it fresh: errors and archiving flags never leak across reopenings.
 */
function ArchiveDialogContent({ assessment, onClose, onArchived }) {
  const [isArchiving, setIsArchiving] = useState(false);
  const [error, setError] = useState(null);

  async function handleArchive() {
    setIsArchiving(true);
    setError(null);

    const result = await archiveAssessment(assessment.assessment_id);
    setIsArchiving(false);

    if (result.ok) {
      onArchived(assessment);
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
          Nothing is deleted. Attempts learners have already made are kept, and the
          assessment stays visible under Archived. An archived assessment cannot be
          published again — create a new draft instead.
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
          disabled={isArchiving || !assessment}
          onClick={handleArchive}
        >
          {isArchiving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          Archive
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Confirming that an assessment is withdrawn.
 *
 * Archiving is not deletion: learner attempts point at the assessment, so the
 * row stays and stops being deliverable. Saying so here is the difference
 * between a teacher hesitating and a teacher knowing what the button does.
 */
export function AssessmentArchiveDialog({ open, onOpenChange, onArchived, assessment }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Archive assessment</DialogTitle>
          <DialogDescription>
            {assessment?.title
              ? `${assessment.title} stops being deliverable to learners.`
              : "The assessment stops being deliverable to learners."}
          </DialogDescription>
        </DialogHeader>

        {assessment ? (
          <ArchiveDialogContent
            key={assessment.assessment_id}
            assessment={assessment}
            onClose={() => onOpenChange(false)}
            onArchived={onArchived}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
