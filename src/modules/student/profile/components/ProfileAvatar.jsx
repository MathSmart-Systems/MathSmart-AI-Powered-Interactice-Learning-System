"use client";

import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { removeAvatar, signedAvatarUrl, uploadAvatar } from "../services/avatar-api";
import { ACCEPTED_TYPES, rejectionReason } from "../utils/avatar";

/**
 * The learner's picture, or their initials.
 *
 * Initials are not a placeholder for a missing feature — they are the ordinary
 * state for a learner who has not uploaded anything, and they always render
 * first so the page never has a blank hole waiting for an image.
 */
function Monogram({ initials }) {
  return (
    <span
      aria-hidden="true"
      data-testid="profile-avatar"
      className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-secondary ring-4 ring-primary/10"
    >
      <span className="font-display text-2xl font-semibold text-foreground">
        {initials ?? "?"}
      </span>
    </span>
  );
}

/**
 * The learner's own profile picture: shown, replaced, or removed.
 *
 * A signed link expires, so a picture that fails to load is not treated as an
 * error — the component asks for a fresh link once, and only falls back to
 * initials if that also fails. That is what stops a learner who leaves the
 * page open from watching their own photograph turn into a broken image.
 *
 * Everything destructive is explicit: `Remove` appears only when there is
 * something to remove, and the file input is reached through a real button so
 * it is keyboard-operable rather than a styled input nobody can focus.
 */
export function ProfileAvatar({ userId, initials, name, initialUrl }) {
  const [url, setUrl] = useState(initialUrl ?? null);
  const [busy, setBusy] = useState(null); // "upload" | "remove" | null
  const [error, setError] = useState(null);
  const [refreshed, setRefreshed] = useState(false);
  const inputRef = useRef(null);

  const canEdit = Boolean(userId);

  async function handleChosen(event) {
    const file = event.target.files?.[0] ?? null;
    // The same input is reused for the next attempt, so it is cleared here;
    // otherwise choosing the same file twice fires no change event.
    event.target.value = "";

    const refusal = rejectionReason(file);
    if (refusal) {
      setError(refusal);
      return;
    }

    setBusy("upload");
    setError(null);

    const result = await uploadAvatar(userId, file);

    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUrl(result.url);
    setRefreshed(false);
  }

  async function handleRemove() {
    setBusy("remove");
    setError(null);

    const result = await removeAvatar(userId);

    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUrl(null);
  }

  /**
   * A signed link that has expired looks exactly like a broken image. Asking
   * for a fresh one once is the difference between a picture that recovers and
   * a learner who thinks their upload failed.
   */
  async function handleImageError() {
    if (refreshed || !canEdit) {
      setUrl(null);
      return;
    }

    setRefreshed(true);
    const result = await signedAvatarUrl(userId);
    setUrl(result.ok ? result.url : null);
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex items-center gap-4">
        {url ? (
          /*
           * A plain <img>, deliberately. The source is a short-lived signed
           * Storage URL: next/image would proxy and cache it behind its own
           * optimizer, which outlives the signature it was given and would
           * need the Supabase host added to the app-wide remote patterns —
           * a global change for one picture on one page.
           */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-testid="profile-avatar"
            src={url}
            alt={name ? `${name}'s profile picture` : "Your profile picture"}
            width={80}
            height={80}
            onError={handleImageError}
            className="size-20 shrink-0 rounded-xl object-cover ring-4 ring-primary/10"
          />
        ) : (
          <Monogram initials={initials} />
        )}

        {canEdit ? (
          <div className="flex flex-col gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={handleChosen}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => inputRef.current?.click()}
              >
                <Camera aria-hidden="true" className="size-4" />
                {busy === "upload" ? "Uploading…" : url ? "Change picture" : "Add picture"}
              </Button>

              {url ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={busy !== null}
                  onClick={handleRemove}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  {busy === "remove" ? "Removing…" : "Remove"}
                </Button>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 2 MB.</p>
          </div>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
