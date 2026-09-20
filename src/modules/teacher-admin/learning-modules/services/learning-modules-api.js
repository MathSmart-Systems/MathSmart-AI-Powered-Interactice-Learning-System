/**
 * Server-side reads and writes for Learning Modules.
 *
 * This module runs only on the server. It forwards the caller's own Supabase
 * access token to the MathSmart API and never touches a secret key. The API
 * verifies the token against the project's JWKS and the column grants decide
 * what may be authored, so an author can only publish through the same routes
 * a learner reads.
 *
 * Every non-2xx envelope is decoded into a safe `message` and, when present,
 * the author-form `fields` so the dialog can point at the offending inputs.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { secureApiBaseUrl } from "../utils/api-url.js";
import { readAllCompetencies } from "@/modules/shared/services/competency-pagination.js";

const REQUEST_TIMEOUT_MS = 10_000;

function apiBaseUrl() {
  return secureApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
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
 * One authenticated request against the MathSmart API.
 *
 * @returns {Promise<{ok: boolean, status: number|null, data?: unknown, meta?: unknown, message?: string, fields?: object|null}>}
 */
async function apiRequest(path, { method = "GET", body = null } = {}) {
  const base = apiBaseUrl();

  if (!base) {
    return {
      ok: false,
      status: null,
      message: "The Learning Modules service is not configured on this deployment.",
    };
  }

  const token = await accessToken();

  if (!token) {
    return {
      ok: false,
      status: null,
      message: "Your session could not be verified. Sign in again and retry.",
    };
  }

  const headers = { Accept: "application/json" };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }

  let response;

  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return {
      ok: false,
      status: null,
      message: "The Learning Modules service could not be reached. Try again in a moment.",
    };
  }

  let payload = null;

  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = payload?.error;
    return {
      ok: false,
      status: response.status,
      message:
        typeof error?.message === "string" && error.message
          ? error.message
          : "Something went wrong. The change was not saved.",
      fields: error?.fields ?? null,
    };
  }

  return {
    ok: true,
    status: response.status,
    data: payload?.data ?? null,
    meta: payload?.meta ?? null,
  };
}

/** The module rows, normalised alongside the pagination envelope. */
export async function listModules({
  search = "",
  status = "published",
  page = 1,
  pageSize = 10,
} = {}) {
  const query = new URLSearchParams();

  if (search) {
    query.set("search", search);
  }

  query.set("status", status);

  query.set("page", String(page));
  query.set("page_size", String(pageSize));

  const result = await apiRequest(`/teacher-admin/modules?${query.toString()}`);

  if (!result.ok) {
    return result;
  }

  return { ...result, items: Array.isArray(result.data) ? result.data : [] };
}

/** Every competency the author dialog and the row labels need. */
export async function listCompetencies() {
  return readAllCompetencies((page, pageSize) =>
    apiRequest(`/teacher-admin/competencies?page=${page}&page_size=${pageSize}`),
  );
}

/** One module's full readable content, for the edit dialog. */
export async function readModule(moduleId) {
  const result = await apiRequest(`/teacher-admin/modules/${moduleId}`);

  if (!result.ok) {
    return result;
  }

  return { ...result, module: result.data ?? null };
}

export async function createModule(payload) {
  return apiRequest("/teacher-admin/modules", { method: "POST", body: payload });
}

export async function updateModule(moduleId, payload) {
  return apiRequest(`/teacher-admin/modules/${moduleId}`, {
    method: "PATCH",
    body: payload,
  });
}

/** Archives a module; it is never deleted, so learner records stay intact. */
export async function archiveModule(moduleId) {
  return apiRequest(`/teacher-admin/modules/${moduleId}`, { method: "DELETE" });
}

/**
 * Brings an archived module back as a draft so it can be edited and published.
 *
 * A dedicated route rather than a `status` patch. Archiving frees the module's
 * place in its competency — the unique index on (competency, order) exempts
 * archived rows — so by the time anybody restores it, another module has
 * usually taken that place. Patching the status alone then violated the index
 * and came back as "Another record already uses one of those values". The
 * route checks the place and the write in one transaction and moves the module
 * to the end of the competency when it has to.
 */
export async function restoreModule(moduleId) {
  return apiRequest(`/teacher-admin/modules/${moduleId}/restore`, { method: "POST" });
}

/**
 * What still points at a module, and whether it could be removed.
 *
 * Read from the server rather than assembled here: the counts are taken inside
 * the same transaction the deletion runs in, with the row locked, so the
 * preview a teacher confirms against cannot go stale in between.
 */
export async function readModuleReferences(moduleId) {
  return apiRequest(`/teacher-admin/modules/${moduleId}/references`);
}

/**
 * Permanently removes an archived module that was never used.
 *
 * Not the DELETE verb, which archives. PostgreSQL refuses a module carrying an
 * activity, a learning-path item or a learner's progress, whatever the server
 * believes.
 */
export async function deleteModule(moduleId) {
  return apiRequest(`/teacher-admin/modules/${moduleId}/delete`, { method: "POST" });
}
