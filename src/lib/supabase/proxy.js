import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

import { AUTH_NOTICE } from "@/lib/auth/notices";
import {
  LOGIN_PATH,
  homePathForRole,
  isProtectedPath,
  parseTrustedRole,
  workspaceForPath,
} from "@/lib/auth/roles";

import { getSupabaseConfig, isSupabaseConfigured } from "./config";

function redirectTo(request, pathname, notice) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  if (notice) {
    url.searchParams.set("notice", notice);
  }

  return NextResponse.redirect(url);
}

/**
 * Protected documents must not be restored from the back/forward cache after a
 * sign-out, so they are marked uncacheable.
 */
function denyStoredCopies(response) {
  response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  return response;
}

/**
 * Refreshes the Supabase session on every request and keeps unauthenticated or
 * wrong-workspace navigation off protected routes. Protected layouts repeat
 * these checks server-side; the proxy only improves navigation behaviour.
 */
export async function updateSession(request) {
  const { pathname } = request.nextUrl;
  const protectedPath = isProtectedPath(pathname);

  if (!isSupabaseConfigured()) {
    return protectedPath
      ? redirectTo(request, LOGIN_PATH, AUTH_NOTICE.CONFIGURATION)
      : NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const { url, publicKey } = getSupabaseConfig();

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(url, publicKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          supabaseResponse.headers.set(key, value),
        );
      },
    },
  });

  // Do not run code between createServerClient and supabase.auth.getClaims().
  // A simple mistake could make it very hard to debug issues with users being
  // randomly logged out.
  let claims = null;
  let claimsFailed = false;

  try {
    const { data, error } = await supabase.auth.getClaims();
    claims = error ? null : (data?.claims ?? null);
    claimsFailed = Boolean(error);
  } catch {
    claimsFailed = true;
  }

  if (!protectedPath) {
    return supabaseResponse;
  }

  if (claimsFailed) {
    return redirectTo(request, LOGIN_PATH, AUTH_NOTICE.SERVICE);
  }

  if (!claims) {
    return redirectTo(request, LOGIN_PATH, AUTH_NOTICE.SESSION_EXPIRED);
  }

  const role = parseTrustedRole(claims);

  if (!role) {
    return redirectTo(request, LOGIN_PATH, AUTH_NOTICE.NO_WORKSPACE);
  }

  if (workspaceForPath(pathname) !== role) {
    return NextResponse.redirect(new URL(homePathForRole(role), request.url));
  }

  // IMPORTANT: return the supabaseResponse object as it is, so the browser and
  // the server do not go out of sync and end the session prematurely. Only
  // headers are added here; the cookies are left untouched.
  return denyStoredCopies(supabaseResponse);
}
