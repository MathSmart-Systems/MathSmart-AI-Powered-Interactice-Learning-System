"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateOwnName } from "../services/api";

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 120;

/**
 * Change the learner's own display name.
 *
 * This is the one thing a learner may change about themselves; the API accepts
 * it and re-reads the record, so the saved name comes back in the response. A
 * failure keeps the dialog open with the reason, so a network blip never looks
 * like a silent success.
 */
export function EditNameDialog({ open, onOpenChange, initialName = "", onSaved }) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function handleOpenChange(nextOpen) {
    if (busy) {
      return;
    }
    if (nextOpen) {
      setName(initialName);
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmed = name.trim();

    if (trimmed.length < MIN_NAME_LENGTH || trimmed.length > MAX_NAME_LENGTH) {
      setError(`Your name needs between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters.`);
      return;
    }

    setBusy(true);
    setError(null);

    const result = await updateOwnName(trimmed);

    if (result.ok) {
      onSaved?.(result.data?.full_name ?? trimmed);
      setBusy(false);
      onOpenChange(false);
      return;
    }

    setError(result.error ?? "Your name could not be saved. Please try again.");
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:rounded-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-semibold">Edit your name</DialogTitle>
            <DialogDescription>
              The name your teacher and MathSmart use on your learning record.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-full-name">Full name</Label>
              <Input
                id="profile-full-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={MIN_NAME_LENGTH}
                maxLength={MAX_NAME_LENGTH}
                aria-required="true"
                aria-invalid={error ? true : undefined}
              />
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Your class, your section and your learning status are school records,
              so only your teacher can change those.
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save name"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}