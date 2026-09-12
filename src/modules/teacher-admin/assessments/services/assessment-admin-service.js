/**
 * Assessment administration, as the browser calls it.
 *
 * The workspace is interactive authoring, so these run in the browser with the
 * signed-in teacher's own Supabase access token. Nothing here decides
 * authorization: the API verifies the token against the project's JWKS, and Row
 * Level Security decides which rows the answer may contain.
 *
 * The request plumbing itself lives in `./api-client.js`, which imports nothing
 * from the application so its failure paths can be unit-tested against a
 * stubbed `fetch`. This file only supplies the base address, the session's
 * token, and the routes.
 */

import { createClient } from "@/lib/supabase/client";

import { DEFAULT_PAGE_SIZE, createApiClient, pageQuery } from "./api-client.js";

export { DEFAULT_PAGE_SIZE } from "./api-client.js";

function apiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
}

/**
 * The signed-in teacher's own access token.
 *
 * Read per request rather than captured once, so a token refreshed while the
 * workspace is open is the one that gets sent.
 */
async function accessToken() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    return error ? null : (data?.session?.access_token ?? null);
  } catch {
    return null;
  }
}

function client() {
  return createApiClient({ baseUrl: apiBaseUrl(), getAccessToken: accessToken });
}

function request(path, options) {
  return client().request(path, options);
}

/**
 * One page of assessments. Search, status and paging are the API's, not the
 * browser's: filtering a single fetched page would hide every assessment after
 * it.
 */
export function listAssessments({
  search = "",
  status = null,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  token = null,
} = {}) {
  return request(
    `/teacher-admin/assessments?${pageQuery({ search, status, page, pageSize })}`,
    { token }
  );
}

/** One assessment, including its ordered `question_ids`. */
export function getAssessment(assessmentId, { token = null } = {}) {
  return request(`/teacher-admin/assessments/${encodeURIComponent(assessmentId)}`, { token });
}

export function createAssessment(draft, { token = null } = {}) {
  return request("/teacher-admin/assessments", { method: "POST", body: draft, token });
}

export function updateAssessment(assessmentId, changes, { token = null } = {}) {
  return request(`/teacher-admin/assessments/${encodeURIComponent(assessmentId)}`, {
    method: "PATCH",
    body: changes,
    token,
  });
}

/** Archive, never delete: learner history points at the assessment. */
export function archiveAssessment(assessmentId, { token = null } = {}) {
  return request(`/teacher-admin/assessments/${encodeURIComponent(assessmentId)}`, {
    method: "DELETE",
    token,
  });
}

/**
 * Replaces the ordered membership as a whole.
 *
 * The API replaces the entire list inside one transaction, so `questionIds`
 * must be the complete intended membership in delivery order.
 */
export function replaceAssessmentQuestions(assessmentId, questionIds, { token = null } = {}) {
  return request(`/teacher-admin/assessments/${encodeURIComponent(assessmentId)}/questions`, {
    method: "PUT",
    body: { question_ids: questionIds },
    token,
  });
}

export function publishAssessment(assessmentId, { token = null } = {}) {
  return request(`/teacher-admin/assessments/${encodeURIComponent(assessmentId)}/publish`, {
    method: "POST",
    token,
  });
}

export function listGrades({ page = 1, pageSize = DEFAULT_PAGE_SIZE, token = null } = {}) {
  return request(`/teacher-admin/grades?${pageQuery({ search: "", page, pageSize })}`, { token });
}

/** Question bank rows, for choosing an assessment's membership. */
export function listQuestions({
  search = "",
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  token = null,
} = {}) {
  return request(`/teacher-admin/questions?${pageQuery({ search, page, pageSize })}`, { token });
}
