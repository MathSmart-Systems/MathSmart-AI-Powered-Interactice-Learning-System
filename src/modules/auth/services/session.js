import { redirect } from "next/navigation";

import { AUTH_NOTICE, loginPathWithNotice } from "@/lib/auth/notices";
import { homePathForRole, parseTrustedRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Resolves the verified session for the current request.
 *
 * `getClaims()` validates the token signature, so its result is safe to
 * authorize with. `getSession()` is never used for authorization.
 *
 * @returns {Promise<{status: "unconfigured" | "unavailable" | "anonymous" | "authenticated", claims: object | null, role: string | null, email: string | null}>}
 */
export async function getVerifiedSession() {
  if (!isSupabaseConfigured()) {
    return { status: "unconfigured", claims: null, role: null, email: null };
  }

  let claims = null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error) {
      return { status: "unavailable", claims: null, role: null, email: null };
    }

    claims = data?.claims ?? null;
  } catch {
    return { status: "unavailable", claims: null, role: null, email: null };
  }

  if (!claims) {
    return { status: "anonymous", claims: null, role: null, email: null };
  }

  return {
    status: "authenticated",
    claims,
    role: parseTrustedRole(claims),
    email: typeof claims.email === "string" ? claims.email : null,
  };
}

/**
 * Server-side guard for a workspace layout. Redirects instead of returning when
 * the request is not allowed to render the workspace.
 *
 * @param {string} expectedRole role that owns the workspace being rendered
 */
export async function requireWorkspace(expectedRole) {
  const session = await getVerifiedSession();

  if (session.status === "unconfigured") {
    redirect(loginPathWithNotice(AUTH_NOTICE.CONFIGURATION));
  }

  if (session.status === "unavailable") {
    redirect(loginPathWithNotice(AUTH_NOTICE.SERVICE));
  }

  if (session.status === "anonymous") {
    redirect(loginPathWithNotice(AUTH_NOTICE.SESSION_EXPIRED));
  }

  if (!session.role) {
    redirect(loginPathWithNotice(AUTH_NOTICE.NO_WORKSPACE));
  }

  if (session.role !== expectedRole) {
    redirect(homePathForRole(session.role));
  }

  return { role: session.role, email: session.email };
}
