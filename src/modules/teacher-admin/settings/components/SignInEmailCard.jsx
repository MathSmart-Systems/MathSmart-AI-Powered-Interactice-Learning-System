"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";

import { FIELD_IDS } from "../utils/constants.js";
import {
  EMAIL_CHANGE_AVAILABLE,
  EMAIL_CHANGE_CANCELLED,
  EMAIL_CHANGE_PAUSED,
  emailChangeOutcome,
  validateNewEmail,
} from "../utils/email-change.js";
import {
  cancelEmailChange,
  readSignedInAccount,
  requestEmailChange,
} from "../services/settings-admin-service.js";

/**
 * The sign-in email, and a request to change it.
 *
 * The current address is the confirmed one and stays on screen, unchanged,
 * after a request is sent. A pending address is shown as pending, never as
 * the account's email. See `utils/email-change.js` for why an address that
 * belongs to someone else gets the same answer as one that was accepted.
 *
 * @param {object} props
 * @param {{current: string|null, pending: string|null}} props.account
 * @param {(account: {email: string|null, new_email: string|null}|null) => void} props.onAccountRead
 * @param {(toast: {tone: string, message: string}) => void} props.onToast
 */
export function SignInEmailCard({ account, onAccountRead, onToast }) {
  const [value, setValue] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    const result = await cancelEmailChange();
    // Whatever the reply, show what Auth now holds rather than what was hoped.
    onAccountRead(await readSignedInAccount());
    setCancelling(false);
    onToast(
      result.ok
        ? { tone: "success", message: EMAIL_CHANGE_CANCELLED }
        : { tone: "error", message: "The pending change could not be cancelled. Try again." },
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const checked = validateNewEmail(value, account.current);
    if (!checked.ok) {
      setFieldError(checked.error);
      return;
    }

    setFieldError(null);
    setSending(true);
    const outcome = emailChangeOutcome(await requestEmailChange(checked.email));
    if (outcome.sent) {
      setValue("");
      // Read back what Supabase now holds, so a pending address shows as
      // pending. The current address does not move.
      onAccountRead(await readSignedInAccount());
    }
    setSending(false);
    onToast({ tone: outcome.tone, message: outcome.message });
  };

  return (
    <section
      aria-labelledby="sign-in-email-heading"
      className="bg-card p-6 sm:p-8 rounded-xl border border-border shadow-xs space-y-5"
    >
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Mail className="size-5 text-primary" aria-hidden="true" />
        <div>
          <h2 id="sign-in-email-heading" className="font-display text-lg font-semibold text-foreground">
            Sign-in email
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            The address you use to sign in to MathSmart.
          </p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-3.5">
          <dt className="text-xs text-muted-foreground">Current email</dt>
          <dd className="mt-1 break-all text-sm font-semibold text-foreground" data-testid="current-email">
            {account.current ?? "—"}
          </dd>
        </div>
        {account.pending ? (
          <div className="min-w-0 rounded-lg border border-dashed border-border p-3.5">
            <dt className="text-xs text-muted-foreground">Waiting for confirmation</dt>
            <dd className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 break-all text-sm text-foreground" data-testid="pending-email">
                {account.pending}
              </span>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                aria-busy={cancelling}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-60"
              >
                {cancelling ? (
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : null}
                {cancelling ? "Cancelling…" : "Cancel pending change"}
              </button>
            </dd>
          </div>
        ) : null}
      </dl>

      {EMAIL_CHANGE_AVAILABLE ? null : (
        <p className="text-sm text-muted-foreground" data-testid="email-change-paused">
          {EMAIL_CHANGE_PAUSED}
        </p>
      )}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="max-w-md space-y-3"
        hidden={!EMAIL_CHANGE_AVAILABLE}
      >
        <div className="space-y-1.5">
          <label htmlFor={FIELD_IDS.NEW_EMAIL_INPUT} className="block text-xs font-semibold text-foreground">
            New email address
          </label>
          <input
            id={FIELD_IDS.NEW_EMAIL_INPUT}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={value}
            disabled={sending}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={`${FIELD_IDS.NEW_EMAIL_INPUT}-hint`}
            onChange={(event) => {
              setValue(event.target.value);
              if (fieldError) setFieldError(null);
            }}
            className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-hidden transition-colors focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-50 aria-invalid:border-destructive"
          />
          <p
            id={`${FIELD_IDS.NEW_EMAIL_INPUT}-hint`}
            className={`min-h-4 text-xs ${fieldError ? "text-destructive" : "text-muted-foreground"}`}
          >
            {fieldError ?? "We send a link to both addresses. Your email changes after you open both."}
          </p>
        </div>

        <button
          type="submit"
          disabled={sending || !value.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Mail className="size-3.5" aria-hidden="true" />
          )}
          <span>{sending ? "Sending links…" : "Send confirmation links"}</span>
        </button>
      </form>
    </section>
  );
}
