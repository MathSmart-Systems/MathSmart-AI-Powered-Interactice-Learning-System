/**
 * Changing the sign-in email, as Supabase's secure email change does it.
 *
 * The request is only a request. Supabase keeps the new address as pending
 * and sends a confirmation link to both the current and the new address; the
 * sign-in email changes only when both have been followed, and a database
 * trigger then copies it to the profile. Until then the current address is
 * the account's email everywhere, and nothing here pretends otherwise.
 *
 * One reply is deliberately the same for two different outcomes: an address
 * already used by another account gets the same "check your inbox" answer as
 * one that was accepted, so this form cannot be used to find out who has an
 * account.
 */

/**
 * Whether new email-change requests can be made from this deployment.
 *
 * Off unless `NEXT_PUBLIC_EMAIL_CHANGE_ENABLED` is "true": a request sends two
 * confirmation emails, so it waits until the deployment can deliver email.
 * Withdrawing a change already pending always works.
 */
export const EMAIL_CHANGE_AVAILABLE = process.env.NEXT_PUBLIC_EMAIL_CHANGE_ENABLED === "true";

export const EMAIL_CHANGE_PAUSED =
  "Changing your sign-in email is paused until email delivery is set up for MathSmart.";

export const EMAIL_CHANGE_CANCELLED =
  "Pending email change cancelled. Your sign-in email is unchanged, and the confirmation links no longer work.";

/** The profile table's own limits. */
const MIN_LENGTH = 6;
const MAX_LENGTH = 254;
const SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const EMAIL_CHANGE_SENT =
  "Check both inboxes. We sent a confirmation link to your current and your new address. Your current email stays active until both links are opened.";

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normaliseEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Checks an address before anything is sent.
 *
 * @param {unknown} value - What was typed
 * @param {string|null|undefined} currentEmail - The confirmed address
 * @returns {{ok: true, email: string} | {ok: false, error: string}}
 */
export function validateNewEmail(value, currentEmail) {
  const email = normaliseEmail(value);
  if (!email) return { ok: false, error: "Enter the new email address." };
  if (email.length < MIN_LENGTH || email.length > MAX_LENGTH || !SHAPE.test(email)) {
    return { ok: false, error: "Enter a valid email address, like name@school.edu.ph." };
  }
  if (email === normaliseEmail(currentEmail)) {
    return { ok: false, error: "That is already your email address." };
  }
  return { ok: true, email };
}

/**
 * The teacher-facing answer to `supabase.auth.updateUser({ email })`.
 *
 * @param {{error?: {code?: string, status?: number, message?: string}|null}|null|undefined} result
 * @returns {{tone: "success"|"error", message: string, sent: boolean}}
 */
export function emailChangeOutcome(result) {
  const error = result?.error ?? null;
  if (!error) return { tone: "success", message: EMAIL_CHANGE_SENT, sent: true };

  const code = String(error.code ?? "").toLowerCase();
  const text = String(error.message ?? "").toLowerCase();

  // Somebody else's address: answered exactly like a sent request.
  if (code === "email_exists" || code === "user_already_exists" || /already (been )?registered|already exists/.test(text)) {
    return { tone: "success", message: EMAIL_CHANGE_SENT, sent: true };
  }
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || error.status === 429) {
    return {
      tone: "error",
      message: "Too many email requests. Wait a few minutes, then try again.",
      sent: false,
    };
  }
  if (code === "email_address_invalid" || code === "validation_failed") {
    return { tone: "error", message: "Enter a valid email address, like name@school.edu.ph.", sent: false };
  }
  if (code === "same_email" || /same.*email/.test(text)) {
    return { tone: "error", message: "That is already your email address.", sent: false };
  }
  if (code === "session_not_found" || code === "no_authorization" || error.status === 401) {
    return { tone: "error", message: "Your session has ended. Sign in again, then change your email.", sent: false };
  }
  if (code === "email_address_not_authorized" || /sending|smtp|deliver/.test(text) || error.status >= 500) {
    return {
      tone: "error",
      message: "The confirmation email could not be sent. Your email has not changed. Try again later.",
      sent: false,
    };
  }
  return {
    tone: "error",
    message: "Your email could not be changed right now. Your current email is unchanged.",
    sent: false,
  };
}

/**
 * The address shown as the account's email, and a pending one if any.
 *
 * Only `email` is ever the account's address. `new_email` is what Supabase is
 * waiting to confirm, and is shown only as pending.
 *
 * @param {{email?: string|null, new_email?: string|null}|null|undefined} user - The Auth user
 * @returns {{current: string|null, pending: string|null}}
 */
export function readAccountEmail(user) {
  const current = normaliseEmail(user?.email) || null;
  const pending = normaliseEmail(user?.new_email) || null;
  return { current, pending: pending && pending !== current ? pending : null };
}

/** What the confirmation route reports back, by the `email_change` query value. */
export const EMAIL_CHANGE_RESULTS = Object.freeze({
  confirmed: {
    tone: "success",
    message: "Your email address has been changed. Use the new address the next time you sign in.",
  },
  pending: {
    tone: "success",
    message: "One link confirmed. Open the link sent to your other address to finish the change.",
  },
  check: {
    tone: "success",
    message: "If both confirmation links have been opened, your email has changed. Sign in with your new address.",
  },
  failed: {
    tone: "error",
    message: "That confirmation link has expired or was already used. Your email has not changed. Request the change again.",
  },
});

/**
 * @param {string|null|undefined} value - The `email_change` query value
 * @returns {{tone: "success"|"error", message: string}|null}
 */
export function emailChangeResult(value) {
  return Object.hasOwn(EMAIL_CHANGE_RESULTS, value ?? "") ? EMAIL_CHANGE_RESULTS[value] : null;
}
