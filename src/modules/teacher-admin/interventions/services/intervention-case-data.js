/**
 * Server-side read for one intervention case.
 *
 * Runs only on the server. It forwards the caller's own Supabase access token
 * to the MathSmart API, never touches a secret key, and decides nothing: the
 * case's severity, status and evidence are the API's answer, read under the
 * caller's own policies. A case belonging to a learner this educator may not
 * see comes back as "not found", which is the same answer as one that does not
 * exist — on purpose.
 *
 * The case opens as a page rather than a dialog, so this read happens before
 * anything is painted and the first thing on screen is the case itself.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { secureApiBaseUrl } from "@/modules/shared/utils/api-url";
import { apiBaseUrlFrom } from "../../../../lib/api/base-url.js";

const REQUEST_TIMEOUT_MS = 10_000;

/** What went wrong, when something did. */
export const CASE_ERROR = Object.freeze({
  UNCONFIGURED: "unconfigured",
  SESSION: "session",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  UNAVAILABLE: "unavailable",
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
 * Reads one case, with the deterministic evidence behind it.
 *
 * @param {string} interventionId
 * @returns {Promise<{caseDetail: object|null, sections: Array, error?: string}>}
 */
export async function readInterventionCase(interventionId) {
  const base = apiBaseUrlFrom(process.env.NEXT_PUBLIC_API_BASE_URL, secureApiBaseUrl);
  if (!base) return { caseDetail: null, error: CASE_ERROR.UNCONFIGURED };

  const token = await accessToken();
  if (!token) return { caseDetail: null, error: CASE_ERROR.SESSION };

  let response;
  try {
    response = await fetch(`${base}/interventions/${interventionId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { caseDetail: null, error: CASE_ERROR.UNAVAILABLE };
  }

  if (!response.ok) {
    if (response.status === 404) return { caseDetail: null, error: CASE_ERROR.NOT_FOUND };
    if (response.status === 403) return { caseDetail: null, error: CASE_ERROR.FORBIDDEN };
    if (response.status === 401) return { caseDetail: null, error: CASE_ERROR.SESSION };
    return { caseDetail: null, error: CASE_ERROR.UNAVAILABLE };
  }

  try {
    const body = await response.json();
    const caseDetail = body?.data ?? null;
    if (!caseDetail?.id) return { caseDetail: null, error: CASE_ERROR.UNAVAILABLE };
    return { caseDetail };
  } catch {
    return { caseDetail: null, error: CASE_ERROR.UNAVAILABLE };
  }
}
