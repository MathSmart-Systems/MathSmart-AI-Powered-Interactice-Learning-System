/**
 * Server-side reads for the learner profile.
 *
 * This module runs only on the server. It forwards the caller's own Supabase
 * access token to the MathSmart API and asks it for the learner's own record
 * and verified identity; it never queries a reporting table, never touches a
 * secret key, and never decides anything of its own. The `/me` routes take no
 * learner identifier from the request, and the API's Row Level Security refuses
 * anything that is not the caller's own record.
 *
 * The access token is read from the session cookie purely to be forwarded.
 * Authorization is still the token's own verified claims, exactly as the
 * dashboard reads document it.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { buildProfileModel } from "../utils/profile-model.js";

const REQUEST_TIMEOUT_MS = 10_000;

/** Every outcome the profile knows how to render. */
export const PROFILE_STATE = Object.freeze({
  READY: "ready",
  NO_PROFILE: "no_profile",
  ERROR: "error",
});

function apiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
}

async function accessToken() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();
    return error ? null : (data?.session?.access_token ?? null);
  } catch {
    return null;
  }
}

/**
 * One authenticated GET against the MathSmart API.
 *
 * @returns {Promise<{ok: true, data: unknown} | {ok: false, status: number|null}>}
 */
async function readFromApi(path, token, base) {
  let response;

  try {
    response = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: null };
  }

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  try {
    const body = await response.json();
    return { ok: true, data: body?.data ?? null };
  } catch {
    return { ok: false, status: response.status };
  }
}

/** A learner whose account exists but whose learner record does not. */
function isMissingProfile(result) {
  return result.status === 404 || result.status === 403;
}

/**
 * Reads the signed-in learner's profile.
 *
 * The learner record is the page. The account identity is a supporting read, so
 * an unavailable account degrades to a profile without an email rather than
 * replacing the page with a failure.
 *
 * @returns {Promise<{state: string, model?: object, reason?: string}>}
 */
export async function readProfile() {
  const base = apiBaseUrl();

  if (!base) {
    return { state: PROFILE_STATE.ERROR, reason: "unconfigured" };
  }

  const token = await accessToken();

  if (!token) {
    return { state: PROFILE_STATE.ERROR, reason: "session" };
  }

  const [learner, account] = await Promise.all([
    readFromApi("/students/me", token, base),
    readFromApi("/auth/me", token, base),
  ]);

  if (isMissingProfile(learner)) {
    return { state: PROFILE_STATE.NO_PROFILE };
  }

  if (!learner.ok) {
    return { state: PROFILE_STATE.ERROR, reason: "unavailable" };
  }

  return {
    state: PROFILE_STATE.READY,
    model: buildProfileModel({ learner: learner.data, account: account.ok ? account.data : null }),
  };
}