/**
 * Trusted role vocabulary and workspace routing.
 *
 * MathSmart has exactly two production roles. The role is read only from the
 * verified Supabase Auth claim `app_metadata.role`; `user_metadata`, form
 * fields, URL parameters, and browser storage are never authorization sources,
 * and a missing or unknown role never falls back to a workspace.
 */

export const ROLES = Object.freeze({
  STUDENT: "student",
  TEACHER_ADMIN: "teacher_admin",
});

export const ROLE_HOME = Object.freeze({
  [ROLES.STUDENT]: "/student/dashboard",
  [ROLES.TEACHER_ADMIN]: "/teacher/dashboard",
});

export const LOGIN_PATH = "/login";

const WORKSPACE_PREFIX = Object.freeze({
  [ROLES.STUDENT]: "/student",
  [ROLES.TEACHER_ADMIN]: "/teacher",
});

/**
 * Returns the role a set of verified claims grants, or `null`.
 * @param {Record<string, unknown> | null | undefined} claims verified JWT claims
 */
export function parseTrustedRole(claims) {
  const appMetadata = claims?.app_metadata;

  if (!appMetadata || typeof appMetadata !== "object") {
    return null;
  }

  const role = appMetadata.role;

  return role === ROLES.STUDENT || role === ROLES.TEACHER_ADMIN ? role : null;
}

/** Workspace a pathname belongs to, or `null` for public paths. */
export function workspaceForPath(pathname) {
  for (const [role, prefix] of Object.entries(WORKSPACE_PREFIX)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return role;
    }
  }

  return null;
}

export function isProtectedPath(pathname) {
  return workspaceForPath(pathname) !== null;
}

/** Landing route for a verified role, or the login page when there is none. */
export function homePathForRole(role) {
  return ROLE_HOME[role] ?? LOGIN_PATH;
}
