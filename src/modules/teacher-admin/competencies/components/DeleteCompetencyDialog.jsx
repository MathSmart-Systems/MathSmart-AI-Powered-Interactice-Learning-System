"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { deleteCompetencyAction } from "../actions/competencies";

/** The word a teacher types to confirm. One word, whatever is being removed. */
export const DELETE_CONFIRMATION = "CONFIRM";

/**
 * The confirmation for permanently removing a competency.
 *
 * Only ever reached from an archived competency, and only one that nothing
 * points at — the server checks both, and the database refuses the statement
 * regardless through the foreign keys that make every reference restrict.
 * So this dialog is not what makes the deletion safe; it is what makes it
 * deliberate.
 *
 * On failure the dialog stays open with what was typed. The commonest failure
 * is a competency that turned out to be in use, and the message says which
 * records are holding it rather than that something is.
 */
function DeleteFields({ competency, onCancel, onDeleted }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const matches = typed.trim().toUpperCase() === DELETE_CONFIRMATION;
  const ready = matches && !busy;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!ready) return;

    setBusy(true);
    setError(null);

    const result = await deleteCompetencyAction(competency.id);

    setBusy(false);
    if (!result.ok) {
      setError(result.error?.message ?? "That competency could not be removed.");
      return;
    }
    onDeleted();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-display text-lg font-semibold">
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          Delete {competency.code} permanently?
        </DialogTitle>
        <DialogDescription>
          This cannot be undone. The competency is removed from the catalogue entirely.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-foreground">
          <span className="font-medium">{competency.name}</span>
        </p>

        <p className="text-sm leading-relaxed text-muted-foreground">
          Only a competency nothing points at can be removed. If any question, learning
          module, learner progress record, result, learning-path item or intervention still
          uses it, MathSmart will refuse and say which — archive it instead, which keeps
          everything and can be undone.
        </p>

        <div className="flex flex-col gap-2">
          <Label htmlFor="competency-delete-confirm">
            Type {DELETE_CONFIRMATION} to confirm
          </Label>
          <Input
            id="competency-delete-confirm"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
            aria-describedby="competency-delete-hint"
            aria-invalid={typed.length > 0 && !matches}
          />
          <p id="competency-delete-hint" className="text-xs text-muted-foreground">
            {typed.length > 0 && !matches
              ? `That does not match ${DELETE_CONFIRMATION}.`
              : `Enter ${DELETE_CONFIRMATION} exactly.`}
          </p>
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
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={!ready}>
          <Trash2 aria-hidden="true" className="size-4" />
          {busy ? "Deleting…" : error ? "Try again" : "Delete permanently"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteCompetencyDialog({ competency, open, onOpenChange, onDeleted }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-xl">
        {competency ? (
          <DeleteFields
            // Remounted per opening, so nothing typed for one competency can
            // survive into a confirmation about another.
            key={competency.id}
            competency={competency}
            onCancel={() => onOpenChange(false)}
            onDeleted={onDeleted}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
