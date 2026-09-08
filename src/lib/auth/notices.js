/**
 * Notice keys the login page can be asked to show through the `notice` query
 * parameter. Only these keys are recognised, and the parameter carries no
 * authorization meaning: it selects a message and nothing else.
 */
export const AUTH_NOTICE = Object.freeze({
  SIGNED_OUT: "signed-out",
  NO_WORKSPACE: "no-workspace",
  SESSION_EXPIRED: "session-expired",
  UNAUTHORIZED: "unauthorized",
  CONFIGURATION: "configuration",
  SERVICE: "service",
});

const KNOWN_NOTICES = new Set(Object.values(AUTH_NOTICE));

export function parseAuthNotice(value) {
  return typeof value === "string" && KNOWN_NOTICES.has(value) ? value : null;
}

/** Builds a login URL carrying a notice key. */
export function loginPathWithNotice(notice) {
  return `/login?notice=${encodeURIComponent(notice)}`;
}
