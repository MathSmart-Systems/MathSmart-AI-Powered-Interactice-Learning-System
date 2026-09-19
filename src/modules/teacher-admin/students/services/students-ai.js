/**
 * The one advisory call the Students workspace makes.
 *
 * `POST /ai/teacher-insight` returns a short piece of prose a teacher may find
 * useful when reading a learner's record. It decides nothing: not a score, not
 * a mastery band, not a monitoring status, not an intervention. Every number on
 * the detail page comes from the deterministic progress endpoint and is
 * rendered whether or not this call ever answers.
 *
 * The request carries no learner identity. The contract has no field for one,
 * and the server-side adapter drops any evidence key containing `name`,
 * `email`, `phone` or `key` before anything leaves the process — so a name
 * could not reach Groq even if this file tried to send one.
 *
 * Every Groq-side failure — disabled by policy, timed out, upstream error,
 * malformed reply — collapses to the same `503 groq_assistance_unavailable`.
 * The caller cannot tell them apart, so it must not pretend to.
 */

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Matches the backend's own timeout, which is shorter than this one. */
const REQUEST_TIMEOUT_MS = 15_000;

/** The status the API uses for every Groq-side failure. */
export const UNAVAILABLE_STATUS = 503;

function apiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
}

async function getAccessToken() {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    return error ? null : (data?.session?.access_token ?? null);
  } catch {
    return null;
  }
}

/**
 * Asks for an advisory insight about one competency's evidence.
 *
 * @param {object} evidence - The bounded, identity-free evidence
 * @returns {Promise<{ok: boolean, status: number|null, data?: object, code?: string}>}
 */
export async function fetchTeacherInsight(evidence) {
  const base = apiBaseUrl();
  if (!base) return { ok: false, status: null, code: "unconfigured" };

  const token = await getAccessToken();
  if (!token) return { ok: false, status: null, code: "no_session" };

  let response;
  try {
    response = await fetch(`${base}/ai/teacher-insight`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        competency_id: evidence.competencyId ?? null,
        diagnostic_score: evidence.diagnosticScore ?? null,
        current_score: evidence.currentScore ?? null,
        attempt_count: evidence.attemptCount ?? null,
        unsuccessful_attempts: evidence.unsuccessfulAttempts ?? null,
        incorrect_patterns: [],
        completed_modules: evidence.completedModules ?? [],
        display_context: evidence.displayContext ?? null,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // A transport failure is not different, to a teacher, from the service
    // being switched off: there is no advisory text either way.
    return { ok: false, status: null, code: "unreachable" };
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: json?.error?.code ?? "unavailable",
    };
  }

  return { ok: true, status: response.status, data: json?.data ?? null };
}
