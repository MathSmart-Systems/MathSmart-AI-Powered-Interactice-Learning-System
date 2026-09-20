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

import { unpublishAssessment } from "../services/assessment-admin-service.js";

/** The unpublish body and actions, mounted fresh per row. */
function UnpublishDialogContent({ assessment, onClose, onUnpublished }) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleUnpublish() {
    setIsSaving(true);
    setError(null);

    const result = await unpublishAssessment(assessment.assessment_id);
    setIsSaving(false);

    if (result.ok) {
      onUnpublished(result.data ?? assessment);
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
          &ldquo;{assessment.title}&rdquo; goes back to draft, so no learner can start it until
          you publish it again. Its question list and every attempt already made are kept exactly
          as they are.
        </p>

        <p className="max-w-prose text-sm leading-relaxed break-words text-muted-foreground">
          A learner part-way through this paper needs it to stay published to get back to their
          answers, so this is refused while any attempt is still in progress.
        </p>
      </DialogBody>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-5"
          disabled={isSaving}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="button" className="h-11 px-5" disabled={isSaving} onClick={handleUnpublish}>
          {isSaving ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          {isSaving ? "Returning…" : "Return to draft"}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Taking a published assessment back to draft.
 *
 * Publishing was a one-way door: a typo in a question, a wrong passing mark or
 * a paper published a week early could only be archived, which hides it from
 * the list a teacher works in and reads as "finished with" rather than "not
 * yet". This is the way back.
 */
export function AssessmentUnpublishDialog({ open, onOpenChange, onUnpublished, assessment }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Return assessment to draft</DialogTitle>
          <DialogDescription>Take this assessment back out of learners&rsquo; hands.</DialogDescription>
        </DialogHeader>

        {open && assessment ? (
          <UnpublishDialogContent
            key={assessment.assessment_id}
            assessment={assessment}
            onClose={() => onOpenChange(false)}
            onUnpublished={onUnpublished}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
