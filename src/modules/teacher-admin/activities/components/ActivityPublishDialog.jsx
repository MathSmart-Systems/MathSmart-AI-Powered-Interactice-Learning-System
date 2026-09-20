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

import { publishActivity } from "../services/activity-admin-service.js";
import { formatDuration, formatMasteryThreshold } from "../utils/format.js";
import { canPublishActivity } from "../utils/validation.js";

/**
 * The publish checklist, the action, and the server's refusal when it comes.
 *
 * Mounted fresh per row, so an error or a pending flag never leaks across
 * reopenings.
 */
function PublishDialogContent({ activity, moduleTitle, onClose, onPublished }) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState(null);

  const questionCount = activity?.question_count ?? 0;
  const { canPublish, reason } = canPublishActivity(activity, questionCount);

  async function handlePublish() {
    setIsPublishing(true);
    setError(null);

    const result = await publishActivity(activity.activity_id);
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
            <span className="min-w-0 break-words">{error}</span>
          </p>
        ) : null}

        <p className="font-display text-base font-semibold tracking-tight break-words text-foreground">
          {activity.title}
        </p>

        <dl className="flex flex-col gap-2 border-l-[3px] border-border bg-card px-4 py-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Learning module</dt>
            <dd className="min-w-0 break-words text-right text-foreground">
              {moduleTitle ?? "Not resolved"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Questions</dt>
            <dd className="text-foreground">
              {questionCount} {questionCount === 1 ? "question" : "questions"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Time</dt>
            <dd className="text-foreground">{formatDuration(activity.estimated_minutes)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Pass mark</dt>
            <dd className="text-foreground">
              {formatMasteryThreshold(activity.mastery_threshold)}
            </dd>
          </div>
        </dl>

        {canPublish ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            MathSmart also checks that every question in this activity is published, and that
            its learning module and competency are published too — a learner cannot open an
            activity whose module is still a draft. If any of that is not true, nothing is
            published and the reason appears here.
          </p>
        ) : (
          <p className="max-w-prose text-sm leading-relaxed text-foreground">{reason}</p>
        )}
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" className="h-11 px-5" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          className="h-11 px-5"
          disabled={!canPublish || isPublishing}
          onClick={handlePublish}
        >
          {isPublishing ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          {isPublishing ? "Publishing…" : "Publish"}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Confirming publication.
 *
 * Publishing used to be a value in the edit form's status dropdown with nothing
 * behind it: an activity with no questions published fine, a learner could then
 * start it, be delivered nothing, and be scored zero — a zero that counts
 * toward the rule that opens an intervention.
 *
 * The list below states only what this page already knows. The server checks
 * more, and its refusal is shown here rather than predicted, because predicting
 * it would mean guessing on the learner's behalf.
 */
export function ActivityPublishDialog({
  open,
  onOpenChange,
  onPublished,
  activity,
  moduleTitle = null,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish activity</DialogTitle>
          <DialogDescription>
            Publishing puts this activity in front of learners working through its module.
          </DialogDescription>
        </DialogHeader>

        {activity ? (
          <PublishDialogContent
            key={activity.activity_id}
            activity={activity}
            moduleTitle={moduleTitle}
            onClose={() => onOpenChange(false)}
            onPublished={onPublished}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
