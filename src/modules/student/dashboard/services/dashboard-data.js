/**
 * Server-side reads for the learner dashboard.
 *
 * This module runs only on the server. It forwards the caller's own Supabase
 * access token to the MathSmart API and asks it three questions; it never
 * queries a reporting table, never touches a secret key, and never decides a
 * learner result of its own. The API verifies the token against the project's
 * JWKS and Row Level Security decides which rows the answer may contain, so a
 * learner can only ever read themselves — the `/me` routes take no learner
 * identifier from the request at all.
 *
 * The access token is read from the session cookie purely to be forwarded.
 * Authorization is still the token's own verified claims, checked by the API
 * and again by the database, exactly as `getVerifiedSession` documents.
 */

import { API_BASE_URL } from "@/config/api";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { buildDashboardModel } from "../utils/dashboard-model";

const REQUEST_TIMEOUT_MS = 10_000;

/** Every outcome the dashboard knows how to render. */
export const DASHBOARD_STATE = Object.freeze({
  READY: "ready",
  NO_PROFILE: "no_profile",
  ERROR: "error",
});

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
    // Timed out, refused, or DNS failed: the service is unreachable, which is
    // not the same thing as the learner having no record.
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

/**
 * A learner whose account exists but whose learner record does not. The API
 * says so with 404 from `/students/me` and 403 from `/progress/me`, because
 * naming a learner record you do not have is a refusal there, not a gap.
 */
function isMissingProfile(result) {
  return result.status === 404 || result.status === 403;
}

/**
 * Reads the signed-in learner's dashboard.
 *
 * @returns {Promise<{state: string, model?: object, reason?: string}>}
 */
export async function readDashboard() {
  const base = API_BASE_URL;

  if (!base) {
    return { state: DASHBOARD_STATE.ERROR, reason: "unconfigured" };
  }

  const token = await accessToken();

  if (!token) {
    return { state: DASHBOARD_STATE.ERROR, reason: "session" };
  }

  const [learner, progress, pathItems] = await Promise.all([
    readFromApi("/students/me", token, base),
    readFromApi("/progress/me", token, base),
    readFromApi("/learning-path/me", token, base),
  ]);

  if (isMissingProfile(learner) || isMissingProfile(progress)) {
    return { state: DASHBOARD_STATE.NO_PROFILE };
  }

  // The learner record and the progress record are what the page is about. The
  // path is a supporting list, so an unavailable path degrades to an empty one
  // rather than replacing the whole dashboard with a failure.
  if (!learner.ok || !progress.ok) {
    return { state: DASHBOARD_STATE.ERROR, reason: "unavailable" };
  }

  return {
    state: DASHBOARD_STATE.READY,
    model: buildDashboardModel({
      learner: learner.data,
      progress: progress.data,
      pathItems: pathItems.ok ? pathItems.data : [],
    }),
    pathUnavailable: !pathItems.ok,
  };
}
