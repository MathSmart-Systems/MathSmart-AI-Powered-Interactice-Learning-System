/**
 * Server-side read for one learner's record.
 *
 * Runs only on the server. It forwards the caller's own Supabase access token
 * to the MathSmart API; it never touches a secret key and never decides a
 * result of its own. Both reads are Teacher/Administrator-gated and run under
 * the caller's row-level policies, so a learner they may not see comes back as
 * "not found" rather than as a partial record.
 *
 * The identity read and the progress read are separate concerns: a learner can
 * exist with no progress recorded yet, and that page is still worth showing.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { apiBaseUrlFrom, trimmedBaseUrl } from "../../../../lib/api/base-url.js";

const REQUEST_TIMEOUT_MS = 10_000;

/** What went wrong, when something did. */
export const DETAIL_ERROR = Object.freeze({
  UNCONFIGURED: "unconfigured",
  SESSION: "session",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  UNAVAILABLE: "unavailable",
});

function apiBaseUrl() {
  return apiBaseUrlFrom(process.env.NEXT_PUBLIC_API_BASE_URL, trimmedBaseUrl);
}

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

  if (!response.ok) return { ok: false, status: response.status };

  try {
    const body = await response.json();
    return { ok: true, data: body?.data ?? null };
  } catch {
    return { ok: false, status: response.status };
  }
}

/**
 * Reads one learner's identity, enrollment and deterministic progress.
 *
 * @param {string} studentId
 * @returns {Promise<{student: object|null, progress: object|null, error?: string}>}
 */
export async function readStudentDetail(studentId) {
  const base = apiBaseUrl();
  if (!base) return { student: null, progress: null, error: DETAIL_ERROR.UNCONFIGURED };

  const token = await accessToken();
  if (!token) return { student: null, progress: null, error: DETAIL_ERROR.SESSION };

  const [studentRes, progressRes] = await Promise.all([
    readFromApi(`/students/${studentId}`, token, base),
    readFromApi(`/progress/${studentId}`, token, base),
  ]);

  if (!studentRes.ok) {
    // A learner outside this educator's reach and a learner who does not exist
    // are deliberately the same answer: saying which would confirm the record
    // exists to somebody who may not see it.
    if (studentRes.status === 404) {
      return { student: null, progress: null, error: DETAIL_ERROR.NOT_FOUND };
    }
    if (studentRes.status === 403) {
      return { student: null, progress: null, error: DETAIL_ERROR.FORBIDDEN };
    }
    return { student: null, progress: null, error: DETAIL_ERROR.UNAVAILABLE };
  }

  // Progress is allowed to be missing. A newly enrolled learner has none, and
  // their identity and enrollment are still worth reading.
  return {
    student: studentRes.data,
    progress: progressRes.ok ? progressRes.data : null,
    error: undefined,
  };
}
