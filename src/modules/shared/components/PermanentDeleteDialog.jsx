"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw, Trash2 } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The word a teacher types to confirm. One word, whatever is being removed. */
export const DELETE_CONFIRMATION = "CONFIRM";

/** What each counted table is called in a sentence a teacher reads. */
const REFERENCE_LABELS = Object.freeze({
  assessment_questions: "Seated in assessments",
  activity_questions: "Seated in activities",
  assessment_responses: "Delivered in assessment attempts",
  activity_responses: "Delivered in activity attempts",
  activities: "Activities in this module",
  learning_path_items: "Learning path items",
  student_module_progress: "Learner progress records",
  activity_attempts: "Learner attempts",
  assessment_attempts: "Learner attempts",
  reassessment_authorizations: "Reassessment authorizations",
});

function referenceLabel(key) {
  return REFERENCE_LABELS[key] ?? key.replace(/_/g, " ");
}

/**
 * The confirmation for permanently removing one authored record.
 *
 * It is not what makes the deletion safe. The row policy admits only a record
 * that is already archived, and every foreign key a learner record holds is
 * ON DELETE RESTRICT, so the database refuses anything still in use whatever
 * this dialog believes. What this makes the deletion is deliberate.
 *
 * The counts come from the server, read in the same transaction the deletion
 * will run in, so the preview cannot go stale between confirming and deleting.
 * They are shown whether or not they block: a teacher removing an unused
 * activity should see that its three membership rows go with it, and that the
 * questions those rows name do not.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {string} props.noun - "question", "learning module", "activity", "assessment".
 * @param {string} props.label - What the record is called.
 * @param {string} props.status - Its publication state.
 * @param {() => Promise<object>} props.loadReferences - Resolves the preview.
 * @param {() => Promise<object>} props.onConfirm - Performs the deletion.
 * @param {() => void} props.onDeleted
 * @param {React.ReactNode} [props.disposableNote] - What goes with the record.
 */
function DeleteFields({
  noun,
  label,
  status,
  loadReferences,
  onConfirm,
  onOpenChange,
  onDeleted,
  disposableNote,
}) {
  const fieldId = useId();
  const [typed, setTyped] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const [previewReload, setPreviewReload] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoadingPreview(true);
      const result = await loadReferences();
      if (!active) {
        return;
      }
      if (result.ok) {
        setPreview(result.data);
        setPreviewError(null);
      } else {
        setPreviewError(result.error ?? "The references could not be read.");
      }
      setIsLoadingPreview(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [loadReferences, previewReload]);

  const matches = typed.trim().toUpperCase() === DELETE_CONFIRMATION;
  // Both, and a preview that says the record is free to go. Either one alone
  // is a click somebody can make without reading anything.
  const ready = matches && acknowledged && !busy && preview?.removable === true;

  const counts = Object.entries(preview?.references ?? {}).filter(([, count]) => count > 0);
  const blocking = preview?.blocking ?? {};

  async function handleSubmit(event) {
    event.preventDefault();
    if (!ready) return;

    setBusy(true);
    setError(null);

    const result = await onConfirm();

    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? `That ${noun} could not be removed.`);
      // The commonest failure is a record that turned out to be in use, so the
      // preview is read again rather than left showing what it said before.
      setPreviewReload((index) => index + 1);
      return;
    }
    onDeleted();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-display text-lg font-semibold">
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          Delete permanently?
        </DialogTitle>
        <DialogDescription>
          This cannot be undone. Archive is the safer action and keeps everything.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed break-words text-foreground">
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground"> · {status}</span>
        </p>

        {isLoadingPreview ? (
          <p role="status" className="text-sm text-muted-foreground">
            Reading what points at this {noun}…
          </p>
        ) : previewError ? (
          <div
            role="alert"
            className="flex flex-wrap items-start justify-between gap-3 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-foreground"
          >
            <span className="min-w-0 break-words">
              {previewError} Deletion stays unavailable until this can be read.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => setPreviewReload((index) => index + 1)}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Try again
            </Button>
          </div>
        ) : (
          <>
            {counts.length > 0 ? (
              <dl className="flex flex-col gap-1.5 border-l-[3px] border-border bg-card px-4 py-3 text-sm">
                {counts.map(([key, count]) => (
                  <div key={key} className="flex justify-between gap-4">
                    <dt className="min-w-0 break-words text-muted-foreground">
                      {referenceLabel(key)}
                    </dt>
                    <dd
                      className={
                        blocking[key]
                          ? "font-semibold text-destructive tabular-nums"
                          : "text-foreground tabular-nums"
                      }
                    >
                      {count}
                      {blocking[key] ? (
                        <span className="ml-1.5 font-normal">· blocks deletion</span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="border-l-[3px] border-border bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                Nothing points at this {noun}.
              </p>
            )}

            {disposableNote && preview?.removable ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{disposableNote}</p>
            ) : null}

            {preview && !preview.removable ? (
              <p className="border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-foreground">
                {preview.status === "archived"
                  ? `This ${noun} is still in use, so MathSmart will refuse to remove it. ` +
                    "Nothing a learner did is ever deleted to make room."
                  : `Archive this ${noun} first. Removing one is always a second decision, ` +
                    "taken after a reversible one."}
              </p>
            ) : null}
          </>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${fieldId}-confirm`}>Type {DELETE_CONFIRMATION} to confirm</Label>
          <Input
            id={`${fieldId}-confirm`}
            value={typed}
            autoComplete="off"
            spellCheck={false}
            disabled={!preview?.removable}
            onChange={(event) => setTyped(event.target.value)}
            aria-describedby={`${fieldId}-hint`}
            aria-invalid={typed.length > 0 && !matches}
          />
          <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
            {typed.length > 0 && !matches
              ? `That does not match ${DELETE_CONFIRMATION}.`
              : `Enter ${DELETE_CONFIRMATION} exactly.`}
          </p>
        </div>

        <div className="flex items-start gap-2.5">
          <input
            id={`${fieldId}-acknowledge`}
            type="checkbox"
            checked={acknowledged}
            disabled={!preview?.removable}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded-sm border border-input accent-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Label
            htmlFor={`${fieldId}-acknowledge`}
            className="text-sm leading-relaxed font-normal"
          >
            I understand this {noun} will be removed permanently and cannot be restored.
          </Label>
        </div>

        {error ? (
          <p
            role="alert"
            className="border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm leading-relaxed break-words text-foreground"
          >
            {error}
          </p>
        ) : null}
      </DialogBody>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-5"
          disabled={busy}
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button type="submit" variant="destructive" className="h-11 px-5" disabled={!ready}>
          {busy ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Trash2 aria-hidden="true" className="size-4" />
          )}
          {busy ? "Deleting…" : error ? "Try again" : "Delete permanently"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The dialog shell. The body is remounted per record, so nothing typed for one
 * can survive into a confirmation about another.
 */
export function PermanentDeleteDialog({ open, onOpenChange, record, ...fields }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-xl">
        {open && record ? (
          <DeleteFields key={record.id} onOpenChange={onOpenChange} {...fields} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
