/**
 * Client-side API helper for the learner profile.
 *
 * The server component reads the initial profile; this helper handles the one
 * mutation a learner may make about themselves: editing their own display name.
 * It reads a fresh Supabase access token from the session cookie and forwards
 * it to the MathSmart API, which enforces the column grant again server-side.
 */

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const REQUEST_TIMEOUT_MS = 30_000;

function apiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
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
 * One authenticated request against the MathSmart API.
 *
 * @returns {Promise<{ok: boolean, data?: unknown, status?: number|null, error?: string}>}
 */
async function apiRequest(method, path, { body } = {}) {
  const base = apiBaseUrl();
  if (!base) {
    return { ok: false, status: null, error: "API not configured" };
  }

  const token = await getAccessToken();
  if (!token) {
    return { ok: false, status: null, error: "Session not available" };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const detail =
      cause?.cause?.message || cause?.message || cause?.name || "Network request failed";
    return { ok: false, status: null, error: `Service unavailable (${detail})` };
  }

  const status = response.status;

  if (status === 204) {
    return { ok: true, status };
  }

  let json;
  try {
    json = await response.json();
  } catch {
    return { ok: false, status, error: `Server error (${status})` };
  }

  if (!response.ok) {
    const message = json?.error?.message || json?.detail || `Request failed with status ${status}`;
    return { ok: false, status, error: message };
  }

  return { ok: true, status, data: json?.data ?? json };
}

/**
 * Change the learner's own display name.
 *
 * The updated learner record comes back in the response, so the profile can
 * show the saved name without another round trip.
 */
export async function updateOwnName(fullName) {
  return apiRequest("PATCH", "/students/me", { body: { full_name: fullName } });
}