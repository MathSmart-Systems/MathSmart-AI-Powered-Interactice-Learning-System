import { AUTH_NOTICE } from "@/lib/auth/notices";

/**
 * User-facing authentication copy. Messages stay generic about whether an
 * account exists and never carry Supabase error text, tokens, or configuration
 * values.
 */
export const AUTH_MESSAGES = Object.freeze({
  invalidCredentials: "That email address and password do not match. Check both and try again.",
  missingEmail: "Enter your email address.",
  missingPassword: "Enter your password.",
  configuration:
    "MathSmart is not connected to its sign-in service yet. Ask your administrator to finish the setup.",
  service: "MathSmart cannot reach the sign-in service right now. Wait a moment and try again.",
  noWorkspace:
    "Your account has not been assigned a MathSmart workspace. Contact your administrator.",
  signOutFailed: "MathSmart could not sign you out. Try again.",
});

const NOTICE_MESSAGES = Object.freeze({
  [AUTH_NOTICE.SIGNED_OUT]: {
    tone: "info",
    text: "You are signed out.",
  },
  [AUTH_NOTICE.SESSION_EXPIRED]: {
    tone: "info",
    text: "Your session ended. Sign in to continue.",
  },
  [AUTH_NOTICE.UNAUTHORIZED]: {
    tone: "info",
    text: "Sign in to open that page.",
  },
  [AUTH_NOTICE.NO_WORKSPACE]: {
    tone: "error",
    text: AUTH_MESSAGES.noWorkspace,
  },
  [AUTH_NOTICE.CONFIGURATION]: {
    tone: "error",
    text: AUTH_MESSAGES.configuration,
  },
  [AUTH_NOTICE.SERVICE]: {
    tone: "error",
    text: AUTH_MESSAGES.service,
  },
});

export function messageForNotice(notice) {
  return NOTICE_MESSAGES[notice] ?? null;
}
