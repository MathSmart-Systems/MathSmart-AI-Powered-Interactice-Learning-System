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

/**
 * Resolves the configured base URL for the MathSmart backend API.
 *
 * @returns {string|null}
 */
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

/**
 * Creates an instance of the authenticated API client.
 *
 * @returns {ReturnType<typeof createApiClient>}
 */
function client() {
  return createApiClient({ baseUrl: apiBaseUrl(), getAccessToken: accessToken });
}

/**
 * Dispatches an HTTP request through the authenticated API client.
 *
 * @param {string} path - Target path
 * @param {object} [options] - Fetch and request options
 * @returns {Promise<object>}
 */
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

/**
 * Creates a new assessment record.
 *
 * @param {object} draft - Assessment draft payload
 * @param {object} [options]
 * @param {string|null} [options.token] - Optional explicit auth token
 * @returns {Promise<object>}
 */
export function createAssessment(draft, { token = null } = {}) {
  return request("/teacher-admin/assessments", { method: "POST", body: draft, token });
}

/**
 * Partially updates an existing assessment draft.
 *
 * @param {string} assessmentId - Unique assessment identifier
 * @param {object} changes - Fields to update
 * @param {object} [options]
 * @param {string|null} [options.token] - Optional explicit auth token
 * @returns {Promise<object>}
 */
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

/**
 * Transitions an assessment to the published state after readiness checks pass.
 *
 * @param {string} assessmentId - Unique assessment identifier
 * @param {object} [options]
 * @param {string|null} [options.token] - Optional explicit auth token
 * @returns {Promise<object>}
 */
export function publishAssessment(assessmentId, { token = null } = {}) {
  return request(`/teacher-admin/assessments/${encodeURIComponent(assessmentId)}/publish`, {
    method: "POST",
    token,
  });
}

/**
 * Returns a published assessment to draft so it can be corrected.
 *
 * A route of its own rather than a status patch. The API refuses while a
 * learner has an attempt open, because resuming a paper needs the assessment
 * to still be published and a half-finished sitting must not be taken away.
 *
 * @param {string} assessmentId - Unique assessment identifier
 * @param {object} [options]
 * @param {string|null} [options.token] - Optional explicit auth token
 * @returns {Promise<object>}
 */
export function unpublishAssessment(assessmentId, { token = null } = {}) {
  return request(`/teacher-admin/assessments/${encodeURIComponent(assessmentId)}/unpublish`, {
    method: "POST",
    token,
  });
}

/**
 * Fetches available grade levels for authoring and filtering.
 *
 * @param {object} [options]
 * @param {number} [options.page]
 * @param {number} [options.pageSize]
 * @param {string|null} [options.token]
 * @returns {Promise<object>}
 */
export function listGrades({ page = 1, pageSize = DEFAULT_PAGE_SIZE, token = null } = {}) {
  return request(`/teacher-admin/grades?${pageQuery({ search: "", page, pageSize })}`, { token });
}

/**
 * Question bank rows, for choosing an assessment's membership.
 *
 * No response from this route can carry an answer key: the column grant on
 * `app.questions` withholds it from the caller entirely.
 */
export function listQuestions({
  search = "",
  status = null,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  token = null,
} = {}) {
  return request(
    `/teacher-admin/questions?${pageQuery({ search, status, page, pageSize })}`,
    { token },
  );
}

/**
 * Restores an archived assessment to draft.
 *
 * There was no way to do this: the workspace archived an assessment and then
 * offered nothing on the row, while `canPublishAssessment` told the teacher to
 * "create a new draft instead". The PATCH route has always accepted a status.
 */
export function restoreAssessment(assessmentId, { token = null } = {}) {
  return request(`/teacher-admin/assessments/${encodeURIComponent(assessmentId)}`, {
    method: "PATCH",
    body: { status: "draft" },
    token,
  });
}

/**
 * What still points at an assessment, and whether it could be removed.
 *
 * Read from the server rather than assembled here: the counts are taken inside
 * the same transaction the deletion runs in, with the row locked, so the
 * preview a teacher confirms against cannot go stale in between.
 */
export function readAssessmentReferences(assessmentId, { token = null } = {}) {
  return request(`/teacher-admin/assessments/${encodeURIComponent(assessmentId)}/references`, {
    token,
  });
}

/**
 * Permanently removes an archived assessment nobody ever attempted.
 *
 * Not the DELETE verb, which archives. Its membership rows go with it; the
 * questions they name do not, because that foreign key restricts.
 */
export function deleteAssessmentPermanently(assessmentId, { token = null } = {}) {
  return request(`/teacher-admin/assessments/${encodeURIComponent(assessmentId)}/delete`, {
    method: "POST",
    token,
  });
}
