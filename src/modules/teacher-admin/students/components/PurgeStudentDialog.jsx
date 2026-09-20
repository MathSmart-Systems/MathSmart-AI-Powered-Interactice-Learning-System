"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { learnerName } from "../utils/roster";

/** What each counted table is called in a sentence a teacher reads. */
const CATEGORY = Object.freeze({
  assessment_attempts: "assessment attempts",
  assessment_responses: "assessment answers",
  competency_results: "competency results",
  activity_attempts: "practice attempts",
  activity_responses: "practice answers",
  competency_progress: "competency progress records",
  student_module_progress: "module progress records",
  learning_path_items: "learning path items",
  reassessment_authorizations: "reassessment authorizations",
  interventions: "interventions written by teachers",
});

/**
 * What the purge is about to destroy, in the order a teacher cares about.
 *
 * Counted by the server before anything is deleted, so these are the real
 * numbers rather than a general warning. A category with nothing in it is left
 * out: listing "0 interventions" pads the list and makes the real figures
 * harder to read.
 */
function categories(removes) {
  if (!removes) return [];
  return Object.entries(CATEGORY)
    .map(([key, label]) => ({ label, count: Number(removes[key]) || 0 }))
    .filter((entry) => entry.count > 0);
}

/**
 * What has to be typed before the button works.
 *
 * One word, the same for one learner and for a hundred. Typing it is a
 * deliberate act rather than a memory test: the count and the names are on
 * screen directly above, so what protects the learner is reading them, not
 * transcribing an id.
 *
 * It does not replace the server's own check. Every purge request still
 * carries that learner's id and is verified against the record the server
 * reads for itself, so this gates the act rather than standing in for the
 * verification.
 */
export const PURGE_CONFIRMATION = "CONFIRM";

/**
 * The confirmation for permanently deleting learners.
 *
 * Deliberately slow. Purge cannot be undone and it destroys the school's own
 * record of a child's work, so the dialog asks for three separate things: the
 * confirmation typed out, an acknowledgement ticked, and a button pressed that
 * says exactly what it does. None of them is pre-filled.
 *
 * On failure the dialog stays open with what was typed intact, because the
 * operation is resumable and asking a teacher to retype after a network blip
 * would be punishing them for the network.
 */
function PurgeFields({
  students,
  preview,
  loadingPreview,
  previewError,
  onCancel,
  onConfirm,
  busy,
  error,
}) {
  const only = students.length === 1 ? students[0] : null;
  const name = only ? learnerName(only) : `${students.length} students`;
  const required = PURGE_CONFIRMATION;

  // Both start empty every time, because the form is remounted per selection
  // by its key. Nothing about a destructive confirmation should ever be
  // carried over from the last one.
  const [typed, setTyped] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const matches = typed.trim().toUpperCase() === required.toUpperCase();
  // Counting is what tells a teacher the size of what they are confirming, so
  // a dialog that could not count does not offer the button at all. A failed
  // purge is a different thing entirely: that one keeps the button, because
  // the operation is resumable and pressing it again continues it.
  const ready =
    matches && acknowledged && !busy && !loadingPreview && !previewError;
  const removes = categories(preview?.removes);

  function submit(event) {
    event.preventDefault();
    if (!ready) return;
    // Only the acknowledgement travels. Each request carries its own learner's
    // id, which the server checks against the record it reads for itself —
    // what was typed here gates the act, it is not the identifier.
    onConfirm({ acknowledged });
  }

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle
            aria-hidden="true"
            className="size-4 shrink-0 text-destructive"
          />
          Purge {name} permanently?
        </DialogTitle>
        <DialogDescription>
          {only
            ? "This cannot be undone. Their records are deleted, not archived."
            : `This cannot be undone. All ${students.length} selected students, their records ` +
              "and their sign-in identities are permanently deleted, not archived."}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
        {only ? (
          <p className="font-mono text-xs text-muted-foreground">
            {only.learner_id}
          </p>
        ) : (
          <ul className="max-h-32 space-y-0.5 overflow-y-auto text-sm text-foreground">
            {students.map((learner) => (
              <li key={learner.student_id}>
                {learnerName(learner)}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {learner.learner_id}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-foreground">
            {only
              ? "Deleted forever"
              : `Deleted forever, across ${students.length} students`}
          </p>
          {loadingPreview ? (
            <p role="status" className="mt-1.5 text-sm text-muted-foreground">
              Counting what this would remove…
            </p>
          ) : previewError ? (
            <p role="alert" className="mt-1.5 text-sm text-destructive">
              {previewError}
            </p>
          ) : (
            <ul className="mt-1.5 space-y-0.5 text-sm text-foreground">
              {removes.map((entry) => (
                <li key={entry.label}>
                  {entry.count} {entry.label}
                </li>
              ))}
              <li>
                {only
                  ? "Their MathSmart account and sign-in identity"
                  : `${students.length} MathSmart accounts and their sign-in identities`}
              </li>
            </ul>
          )}
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-bold uppercase tracking-wider text-foreground"
            htmlFor="purge-learner-id"
          >
            Type {PURGE_CONFIRMATION} to confirm
          </label>
          <Input
            id="purge-learner-id"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
            aria-describedby="purge-learner-id-hint"
            aria-invalid={typed.length > 0 && !matches}
          />
          <p
            id="purge-learner-id-hint"
            className="mt-1.5 text-xs text-muted-foreground"
          >
            {typed.length > 0 && !matches
              ? `That does not match ${required}.`
              : `Enter ${required} exactly.`}
          </p>
        </div>

        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="purge-acknowledged"
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <label
            htmlFor="purge-acknowledged"
            className="cursor-pointer text-sm leading-snug text-foreground"
          >
            I understand this permanently deletes{" "}
            {only ? "this learner’s" : `these ${students.length} learners’`}{" "}
            records and cannot be undone.
          </label>
        </div>

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
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={!ready}>
          <Trash2 aria-hidden="true" className="size-4" />
          {busy
            ? "Purging…"
            : error
              ? "Retry purge"
              : only
                ? "Purge student permanently"
                : `Purge ${students.length} students permanently`}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PurgeStudentDialog({
  students,
  preview,
  loadingPreview,
  previewError,
  open,
  onOpenChange,
  onConfirm,
  busy,
  error,
}) {
  const chosen = students ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-xl">
        {chosen.length > 0 ? (
          <PurgeFields
            key={chosen.map((learner) => learner.student_id).join(",")}
            students={chosen}
            preview={preview}
            loadingPreview={loadingPreview}
            previewError={previewError}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
            busy={busy}
            error={error}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
