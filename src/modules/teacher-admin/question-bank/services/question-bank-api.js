/**
 * Server-side reads and writes for the Question Bank.
 *
 * This module runs only on the server. It forwards the caller's own Supabase
 * access token to the MathSmart API and never touches a secret key. The API
 * verifies the token against the project's JWKS and the column grants decide
 * what may be read, so a question response can never carry an `answer_key`.
 *
 * Every non-2xx envelope is decoded into a safe `message` and, when present,
 * the author-form `fields` so the dialog can point at the offending inputs.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { readAllCompetencies } from "@/modules/shared/services/competency-pagination.js";
import { secureApiBaseUrl } from "@/modules/shared/utils/api-url.js";

const REQUEST_TIMEOUT_MS = 10_000;

/** Returns the configured API origin without trailing slashes. */
function apiBaseUrl() {
  return secureApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
}

/** Reads the current teacher's access token without exposing session failures. */
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
      message: "The Question Bank service is not configured on this deployment.",
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
      message: "The Question Bank could not be reached. Try again in a moment.",
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

/**
 * One page of the bank, narrowed by the API rather than by the browser.
 *
 * Every filter is sent to the server. A page filtered after it arrives can
 * only report on the rows it was handed, so the counts and the caption under
 * the list would describe a set the teacher cannot see — and a status holding
 * hundreds of rows would look empty whenever none of them landed on this page.
 */
export async function listQuestions({
  search = "",
  status = "",
  competencyId = "",
  questionType = "",
  difficulty = "",
  page = 1,
  pageSize = 10,
} = {}) {
  const query = new URLSearchParams();

  if (search) {
    query.set("search", search);
  }
  if (status) {
    query.set("status", status);
  }
  if (competencyId) {
    query.set("competency_id", competencyId);
  }
  if (questionType) {
    query.set("question_type", questionType);
  }
  if (difficulty) {
    query.set("difficulty", difficulty);
  }

  query.set("page", String(page));
  query.set("page_size", String(pageSize));

  const result = await apiRequest(`/teacher-admin/questions?${query.toString()}`);

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

/** Creates a question using the validated authoring payload. */
export async function createQuestion(payload) {
  return apiRequest("/teacher-admin/questions", { method: "POST", body: payload });
}

/** Applies validated authoring changes to an existing question. */
export async function updateQuestion(questionId, payload) {
  return apiRequest(`/teacher-admin/questions/${questionId}`, {
    method: "PATCH",
    body: payload,
  });
}

/** Archives a question; it is never deleted, so learner history stays intact. */
export async function archiveQuestion(questionId) {
  return apiRequest(`/teacher-admin/questions/${questionId}`, { method: "DELETE" });
}

/** Brings an archived question back to draft so it can be edited and published. */
export async function restoreQuestion(questionId) {
  return apiRequest(`/teacher-admin/questions/${questionId}`, {
    method: "PATCH",
    body: { status: "draft" },
  });
}
