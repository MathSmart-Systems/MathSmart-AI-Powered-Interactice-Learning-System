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

import { publishAssessment } from "../services/assessment-admin-service.js";
import { formatDuration, formatQuestionCount } from "../utils/format.js";
import { canPublishAssessment } from "../utils/validation.js";

/**
 * The publish confirmation checklist, actions, and server error handling.
 *
 * Separated from the dialog shell so that opening the dialog or switching rows
 * mounts it fresh: errors and publishing flags never leak across reopenings.
 */
function PublishDialogContent({ assessment, onClose, onPublished }) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState(null);

  const questionCount = assessment?.question_count ?? 0;
  const { canPublish, reason } = canPublishAssessment(assessment, questionCount);

  async function handlePublish() {
    setIsPublishing(true);
    setError(null);

    const result = await publishAssessment(assessment.assessment_id);
    setIsPublishing(false);

    if (result.ok) {
      onPublished(result.data);
      return;
    }
    setError(result.error);
  }

  return (
    <>
      <DialogBody className="flex flex-col gap-5">
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

        <p className="font-display text-base font-semibold tracking-tight text-foreground">
          {assessment.title}
        </p>

        <dl className="flex flex-col gap-2 border-l-[3px] border-border bg-card px-4 py-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Questions</dt>
            <dd className="text-foreground">{formatQuestionCount(questionCount)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Time limit</dt>
            <dd className="text-foreground">
              {formatDuration(assessment.duration_minutes)}
            </dd>
          </div>
        </dl>

        {canPublish ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            MathSmart also checks that every question in the assessment is published
            and that the grade level is still active. If either is not true, nothing
            is published and the reason appears here.
          </p>
        ) : (
          <p className="max-w-prose text-sm leading-relaxed text-foreground">{reason}</p>
        )}
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
          className="h-11 px-5"
          disabled={!canPublish || isPublishing}
          onClick={handlePublish}
        >
          {isPublishing ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          Publish
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Confirming publication.
 *
 * The list below states only what this page already knows. The server checks
 * more than that — every question has to be published, and the grade level has
 * to be active — so its refusal is shown here rather than predicted, because
 * predicting it would mean guessing on the learner's behalf.
 */
export function AssessmentPublishDialog({ open, onOpenChange, onPublished, assessment }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish assessment</DialogTitle>
          <DialogDescription>
            Publishing makes this assessment deliverable to Grade 6 learners.
          </DialogDescription>
        </DialogHeader>

        {assessment ? (
          <PublishDialogContent
            key={assessment.assessment_id}
            assessment={assessment}
            onClose={() => onOpenChange(false)}
            onPublished={onPublished}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
