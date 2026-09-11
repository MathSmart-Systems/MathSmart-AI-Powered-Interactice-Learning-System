/**
 * The one way this feature talks to the MathSmart API.
 *
 * Server-only by construction: the access token is read from the session cookie
 * purely to be forwarded, authorization still comes from the token's own
 * verified claims (checked by the API against JWKS, and again by Row Level
 * Security), and no secret key is ever referenced here. Reads and authoring
 * actions share these three helpers so every request follows the same timeout,
 * status and envelope rules.
 *
 * This is a private module of the competencies feature; other modules must use
 * the exported surface in `index.js` instead of importing it directly.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const REQUEST_TIMEOUT_MS = 10_000;

export function apiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
}

export async function accessToken() {
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
 * One request against the MathSmart API.
 *
 * @param {string} path path from the API base URL, e.g. "/competencies"
 * @param {object} [options]
 * @param {string} [options.method="GET"] HTTP method for the write calls
 * @param {object} [options.body] JSON body for the write calls
 * @returns {Promise<{ok: boolean, status: number|null, data?: unknown, payload?: object|null, error?: object|null}>}
 */
export async function apiRequest(path, { method = "GET", body } = {}) {
  const base = apiBaseUrl();

  if (!base) {
    return { ok: false, status: null, error: null, reason: "unconfigured" };
  }

  const token = await accessToken();

  if (!token) {
    return { ok: false, status: null, error: null, reason: "session" };
  }

  let response;

  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Timed out, refused, or DNS failed: the service is unreachable.
    return { ok: false, status: null, error: null, reason: "unreachable" };
  }

  const envelope = await safelyReadBody(response);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: envelope?.error ?? null,
      reason: "http",
    };
  }

  return { ok: true, status: response.status, data: envelope?.data ?? null, payload: envelope, error: null };
}

async function safelyReadBody(response) {
  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** The parts of an error envelope this interface ever exposes to a person. */
export function readApiError(result) {
  if (result?.ok) {
    return null;
  }

  const apiMessage = result?.error?.message;
  const conflictFields = result?.error?.fields;

  if (typeof apiMessage === "string" && apiMessage) {
    return { message: apiMessage, fields: conflictFields ?? null, status: result.status ?? null };
  }

  if (result?.status === 401 || result?.status === 403) {
    return {
      message: "Your session no longer allows this change. Refresh the page and try again.",
      fields: null,
      status: result.status,
    };
  }

  if (result?.status === 404) {
    return {
      message: "That competency no longer exists. It may have been archived by someone else.",
      fields: null,
      status: result.status,
    };
  }

  if (result?.status === 409) {
    return {
      message: "A competency with that code already exists. Codes must be unique.",
      fields: null,
      status: result.status,
    };
  }

  return {
    message: "MathSmart could not save that change. Try again in a moment.",
    fields: null,
    status: result.status ?? null,
  };
}