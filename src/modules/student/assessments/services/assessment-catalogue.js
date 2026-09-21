import { API_BASE_URL } from "./api-config.js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { buildCatalogue } from "../utils/catalogue.js";

/**
 * The assessments this learner may actually reach.
 *
 * The hub used to be a single hard-coded card pointing at the diagnostic
 * route, which meant a published unit quiz was invisible no matter how many a
 * teacher set. This reads the real catalogue instead, and the catalogue is
 * already scoped: `assessments_select` restricts it to published papers, and
 * the API restricts a learner to their own year group. Nothing is filtered
 * here that the server has not already decided.
 */

const REQUEST_TIMEOUT_MS = 10_000;

/** How many papers one class could plausibly have set. */
const PAGE_SIZE = 50;

export const CATALOGUE_STATE = Object.freeze({
  READY: "ready",
  NO_PROFILE: "no_profile",
  ERROR: "error",
});

async function accessToken() {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();
    return error ? null : (data?.session?.access_token ?? null);
  } catch {
    return null;
  }
}

/**
 * Reads the caller's assessment catalogue.
 *
 * Degrades the way the sibling history read does: a learner whose profile is
 * not finished is told that, and everything else is one recoverable error
 * rather than a stack trace.
 */
export async function readAssessmentCatalogue() {
  const base = API_BASE_URL;
  const token = await accessToken();
  if (!base || !token) return { state: CATALOGUE_STATE.ERROR, assessments: [] };

  let response;
  try {
    response = await fetch(`${base}/assessments?status=published&page_size=${PAGE_SIZE}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { state: CATALOGUE_STATE.ERROR, assessments: [] };
  }

  if (response.status === 403 || response.status === 404) {
    return { state: CATALOGUE_STATE.NO_PROFILE, assessments: [] };
  }
  if (!response.ok) return { state: CATALOGUE_STATE.ERROR, assessments: [] };

  try {
    const payload = await response.json();
    return {
      state: CATALOGUE_STATE.READY,
      assessments: buildCatalogue(payload?.data),
    };
  } catch {
    return { state: CATALOGUE_STATE.ERROR, assessments: [] };
  }
}
