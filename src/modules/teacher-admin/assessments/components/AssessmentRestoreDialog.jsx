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

import { restoreAssessment } from "../services/assessment-admin-service.js";

/** The restore body and actions, mounted fresh per row. */
function RestoreDialogContent({ assessment, onClose, onRestored }) {
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState(null);

  async function handleRestore() {
    setIsRestoring(true);
    setError(null);

    const result = await restoreAssessment(assessment.assessment_id);
    setIsRestoring(false);

    if (result.ok) {
      onRestored(result.data ?? assessment);
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

        <p className="max-w-prose text-sm leading-relaxed break-words text-muted-foreground">
          &ldquo;{assessment.title}&rdquo; comes back as a draft, so nothing reaches learners
          until you publish it again. Its question list and every attempt already made are kept
          exactly as they are.
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
 * Bringing an archived assessment back.
 *
 * There was no way to do this. The workspace archived an assessment and then
 * offered nothing on the row, while the publish check told the teacher to
 * "create a new draft instead" — which would have meant rebuilding its whole
 * question list. The PATCH route has always accepted a status.
 */
export function AssessmentRestoreDialog({ open, onOpenChange, onRestored, assessment }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Restore assessment</DialogTitle>
          <DialogDescription>Bring this assessment back as a draft.</DialogDescription>
        </DialogHeader>

        {open && assessment ? (
          <RestoreDialogContent
            key={assessment.assessment_id}
            assessment={assessment}
            onClose={() => onOpenChange(false)}
            onRestored={onRestored}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
