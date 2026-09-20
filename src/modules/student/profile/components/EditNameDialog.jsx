"use client";

import { useState } from "react";

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

import { updateOwnName } from "../services/api";
import { MAX_NAME_LENGTH, nameRejectionReason } from "../utils/name";

/**
 * The form, remounted per opening.
 *
 * Kept separate from the dialog so it can be keyed on `open`. The state that
 * matters here — the half-typed name and the last failure — must not survive a
 * close: reopening used to show an abandoned draft, and worse, re-announced a
 * stale failure through `role="alert"` for a save the learner was no longer
 * attempting. A remount is what makes "opening" mean "starting again", without
 * an effect that would fire on the close as well.
 */
function EditNameFields({ initialName, busy, setBusy, onCancel, onSaved, onClose }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();

    const refusal = nameRejectionReason(name);
    if (refusal) {
      setError(refusal);
      return;
    }

    setBusy(true);
    setError(null);

    const result = await updateOwnName(name.trim());

    if (result.ok) {
      onSaved?.(result.data?.full_name ?? name.trim());
      setBusy(false);
      onClose();
      return;
    }

    // Deliberately leaves `name` alone. A failed save must not cost the
    // learner what they typed.
    setError(result.error ?? "Your name could not be saved. Please try again.");
    setBusy(false);
  }

  return (
    /*
     * `noValidate` because this form has something better to say than the
     * browser does. A native `minLength` refusal is a transient tooltip that
     * blocks submit before any of our code runs: it is not announced, it is
     * not linked to the field, and it disappears on the next keystroke. The
     * message below is `role="alert"` and reachable through `aria-describedby`.
     */
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle className="font-display text-lg font-semibold">Edit your name</DialogTitle>
        <DialogDescription>
          The name your teacher and MathSmart use on your learning record.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="profile-full-name">Full name</Label>
          <Input
            id="profile-full-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_NAME_LENGTH}
            aria-required="true"
            aria-invalid={error ? true : undefined}
            // Points at the message itself, so the field a screen reader lands
            // on carries the reason rather than only the fact of an error.
            aria-describedby={error ? "profile-full-name-error" : undefined}
          />
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          Your class, your section and your learning status are school records,
          so only your teacher can change those.
        </p>

        {error ? (
          <p
            id="profile-full-name-error"
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
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save name"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Change the learner's own display name.
 *
 * This is the one thing about themselves a learner may change through this
 * form; their class, section and learning status are school records the API
 * refuses to take from them. A failure keeps the dialog open with the reason
 * and with what they typed, so a network blip never looks like a silent
 * success and never costs them their work.
 */
export function EditNameDialog({ open, onOpenChange, initialName = "", onSaved }) {
  // Owned here rather than in the form, so a save in flight can refuse Escape
  // and the overlay as well as disabling the buttons. The form is remounted
  // per opening; this is not, which is exactly why it is the one piece of
  // state that belongs outside it.
  const [busy, setBusy] = useState(false);

  function handleOpenChange(nextOpen) {
    if (busy) {
      return;
    }
    onOpenChange(nextOpen);
  }

  function close() {
    setBusy(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:rounded-xl">
        {open ? (
          <EditNameFields
            // Remounted on each opening, so nothing is carried over from the
            // last one. The parent opens this by setting `open` directly,
            // which never reaches `onOpenChange`, so a reset that lived there
            // would never run.
            key={`${open}`}
            initialName={initialName}
            busy={busy}
            setBusy={setBusy}
            onCancel={close}
            onClose={close}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
