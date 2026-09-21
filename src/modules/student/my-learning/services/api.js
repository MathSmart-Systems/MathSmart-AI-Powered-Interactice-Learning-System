/**
 * Client-side writes for Student My Learning.
 *
 * The server component reads the module and its progress; this helper handles
 * the one mutation a learner makes while studying: telling the API which
 * sections of the lesson they have finished. It reads a fresh Supabase access
 * token from the session cookie and forwards it to the MathSmart API, which
 * computes the completion percentage from the caller's own identity server-side
 * rather than trusting the number the browser sends.
 */

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The API's own name for "this content is not open to you yet".
 *
 * `backend/modules/learning_modules/router.py` answers 412 with this code when
 * the database refuses a write against a locked module. The status alone is not
 * enough to act on — 412 also carries `sections_incomplete`, which means
 * something a learner can fix by reading on — so the reader branches on the
 * code and never on the number.
 */
export const CONTENT_LOCKED = "content_locked";

/**
 * The API base URL, trimmed, or `null` when unset or unsafe.
 * HTTPS is required outside local development; loopback hosts remain reachable
 * over HTTP for a local API on port 8000.
 */
function apiBaseUrl(base = process.env.NEXT_PUBLIC_API_BASE_URL) {
  if (typeof base !== "string" || !base) {
    return null;
  }
  const trimmed = base.replace(/\/+$/, "");
  const isLoopback =
    /^http:\/\/127\.0\.0\.1(?::\d+)?($|\/)/i.test(trimmed) ||
    /^http:\/\/localhost(?::\d+)?($|\/)/i.test(trimmed);
  return /^https:/i.test(trimmed) || isLoopback ? trimmed : null;
}

async function getAccessToken() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    return error ? null : (data?.session?.access_token ?? null);
  } catch {
    return null;
  }
}

/**
 * Save the learner's finished sections in a module.
 *
 * The request says which sections are finished and which was the last one
 * looked at. It does not say what that adds up to: the API recomputes the
 * percentage and completion flag from the learner's own record and returns the
 * fresh progress, which the reader shows without another round trip.
 *
 * @returns {Promise<{ok: boolean, data?: object, error?: string, code?: string}>}
 */
export async function saveModuleProgress(moduleId, { completedSectionIds, lastSectionId }) {
  const base = apiBaseUrl();
  if (!base) {
    return { ok: false, error: "API not configured" };
  }

  const token = await getAccessToken();
  if (!token) {
    return { ok: false, error: "Session not available" };
  }

  let response;
  try {
    response = await fetch(`${base}/modules/${moduleId}/progress`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ completed_section_ids: completedSectionIds, last_section_id: lastSectionId }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Your progress could not be saved just now." };
  }

  const status = response.status;
  let json;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: `Your progress could not be saved (${status}).` };
  }

  if (!response.ok) {
    const message = json?.error?.message || json?.detail || `Progress save failed (${status})`;
    // The code travels with the message so the reader can tell a refusal it
    // should explain calmly from a fault it should offer to retry.
    return { ok: false, error: message, code: json?.error?.code ?? null, status };
  }

  return { ok: true, data: json?.data ?? null, status };
}