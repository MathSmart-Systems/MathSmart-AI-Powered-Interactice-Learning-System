/**
 * Activity administration, as the browser calls it.
 *
 * Runs in the browser with the signed-in teacher's own Supabase access token.
 * The API verifies authorization against the project's JWKS and database RLS.
 */

import { createClient } from "@/lib/supabase/client";

import { DEFAULT_PAGE_SIZE, createApiClient, pageQuery } from "./api-client.js";
import { apiBaseUrlFrom, trimmedBaseUrl } from "../../../../lib/api/base-url.js";

export { DEFAULT_PAGE_SIZE } from "./api-client.js";

/**
 * Resolves the configured API base URL without trailing slashes.
 *
 * @returns {string | null}
 */
function apiBaseUrl() {
  return apiBaseUrlFrom(process.env.NEXT_PUBLIC_API_BASE_URL, trimmedBaseUrl);
}

/**
 * The signed-in teacher's own access token.
 *
 * Read per request rather than captured once, so a refreshed token is sent.
 *
 * @returns {Promise<string | null>}
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
 * Instantiates an authentic API client configured for activity administration.
 *
 * @returns {object}
 */
function client() {
  return createApiClient({ baseUrl: apiBaseUrl(), getAccessToken: accessToken });
}

/**
 * Dispatches an authenticated request through the activity client.
 *
 * @param {string} path - Request path
 * @param {object} [options] - Fetch options
 * @returns {Promise<object>}
 */
function request(path, options) {
  return client().request(path, options);
}

/**
 * One page of activities. Search, status, module, and paging are handled on the server.
 *
 * @param {object} [params]
 * @param {string} [params.search] - Case-insensitive title search
 * @param {string|null} [params.status] - Publication status filter (draft, published, archived)
 * @param {string|null} [params.moduleId] - Optional learning module ID filter
 * @param {number} [params.page] - 1-based page index
 * @param {number} [params.pageSize] - Number of records per page
 * @param {string|null} [params.token] - Optional explicit auth token override
 * @returns {Promise<object>}
 */
export function listActivities({
  search = "",
  status = null,
  moduleId = null,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  token = null,
} = {}) {
  return request(
    `/teacher-admin/activities?${pageQuery({ search, status, moduleId, page, pageSize })}`,
    { token }
  );
}

/**
 * Retrieves one activity draft by ID.
 *
 * @param {string} activityId - UUID of the target activity
 * @param {object} [options]
 * @param {string|null} [options.token] - Optional explicit auth token override
 * @returns {Promise<object>}
 */
export function getActivity(activityId, { token = null } = {}) {
  return request(`/teacher-admin/activities/${encodeURIComponent(activityId)}`, { token });
}

/**
 * Creates a new activity draft.
 *
 * @param {object} draft - Activity attributes
 * @param {object} [options]
 * @param {string|null} [options.token] - Optional explicit auth token override
 * @returns {Promise<object>}
 */
export function createActivity(draft, { token = null } = {}) {
  return request("/teacher-admin/activities", { method: "POST", body: draft, token });
}

/**
 * Updates an existing activity draft.
 *
 * @param {string} activityId - UUID of the activity to update
 * @param {object} changes - Attributes to patch
 * @param {object} [options]
 * @param {string|null} [options.token] - Optional explicit auth token override
 * @returns {Promise<object>}
 */
export function updateActivity(activityId, changes, { token = null } = {}) {
  return request(`/teacher-admin/activities/${encodeURIComponent(activityId)}`, {
    method: "PATCH",
    body: changes,
    token,
  });
}

/**
 * Archives an activity (DELETE sets status = 'archived').
 *
 * @param {string} activityId - UUID of the activity to archive
 * @param {object} [options]
 * @param {string|null} [options.token] - Optional explicit auth token override
 * @returns {Promise<object>}
 */
export function archiveActivity(activityId, { token = null } = {}) {
  return request(`/teacher-admin/activities/${encodeURIComponent(activityId)}`, {
    method: "DELETE",
    token,
  });
}

/**
 * Lists learning modules to populate the module dropdown when authoring activities.
 *
 * @param {object} [params]
 * @param {string} [params.search] - Search filter
 * @param {number} [params.page] - 1-based page index
 * @param {number} [params.pageSize] - Number of records per page
 * @param {string|null} [params.token] - Optional explicit auth token override
 * @returns {Promise<object>}
 */
export function listModules({
  search = "",
  page = 1,
  pageSize = 100,
  token = null,
} = {}) {
  return request(
    `/teacher-admin/modules?${pageQuery({ search, page, pageSize })}`,
    { token }
  );
}

/**
 * Restores an archived activity to draft.
 *
 * Archiving was described in the interface as final — "an archived activity
 * cannot be republished, create a new draft instead" — which was never true.
 * The PATCH route has always accepted a status, and the only way a teacher
 * could find that out was by opening the edit form on an archived row.
 *
 * @param {string} activityId - UUID of the activity to restore
 * @param {object} [options]
 * @param {string|null} [options.token] - Optional explicit auth token override
 * @returns {Promise<object>}
 */
export function restoreActivity(activityId, { token = null } = {}) {
  return request(`/teacher-admin/activities/${encodeURIComponent(activityId)}`, {
    method: "PATCH",
    body: { status: "draft" },
    token,
  });
}

/**
 * Replaces an activity's ordered question set in one transaction.
 *
 * Whole-list, like the assessment membership: the position of each question is
 * its place in the array. Reading the current order first is not optional — a
 * save without it would erase the order it was meant to preserve.
 *
 * @param {string} activityId - UUID of the activity
 * @param {string[]} questionIds - Question UUIDs, in delivery order
 * @param {object} [options]
 * @param {string|null} [options.token] - Optional explicit auth token override
 * @returns {Promise<object>}
 */
export function replaceActivityQuestions(activityId, questionIds, { token = null } = {}) {
  return request(`/teacher-admin/activities/${encodeURIComponent(activityId)}/questions`, {
    method: "PUT",
    body: { question_ids: questionIds },
    token,
  });
}

/**
 * Publishes an activity once the server agrees it is safe to deliver.
 *
 * The server checks all of it: a draft, at least one question, every question
 * published, and a published module and competency behind it. Publishing used
 * to be a value in the edit form's status dropdown with nothing behind it.
 *
 * @param {string} activityId - UUID of the activity to publish
 * @param {object} [options]
 * @param {string|null} [options.token] - Optional explicit auth token override
 * @returns {Promise<object>}
 */
export function publishActivity(activityId, { token = null } = {}) {
  return request(`/teacher-admin/activities/${encodeURIComponent(activityId)}/publish`, {
    method: "POST",
    token,
  });
}

/**
 * One page of the Question Bank, for choosing an activity's questions.
 *
 * No response from this route can carry an answer key: the column grant on
 * `app.questions` withholds it from the caller entirely.
 *
 * @param {object} [params]
 * @param {string} [params.search] - Prompt search
 * @param {string|null} [params.status] - Publication status filter
 * @param {string|null} [params.competencyId] - Competency filter
 * @param {number} [params.page] - 1-based page index
 * @param {number} [params.pageSize] - Number of records per page
 * @param {string|null} [params.token] - Optional explicit auth token override
 * @returns {Promise<object>}
 */
export function listQuestions({
  search = "",
  status = null,
  competencyId = null,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  token = null,
} = {}) {
  const query = new URLSearchParams(pageQuery({ search, status, page, pageSize }));
  if (competencyId) {
    query.set("competency_id", competencyId);
  }
  return request(`/teacher-admin/questions?${query.toString()}`, { token });
}

/**
 * What still points at an activity, and whether it could be removed.
 *
 * Read from the server rather than assembled here: the counts are taken inside
 * the same transaction the deletion runs in, with the row locked, so the
 * preview a teacher confirms against cannot go stale in between.
 *
 * @param {string} activityId
 * @param {object} [options]
 * @param {string|null} [options.token]
 * @returns {Promise<object>}
 */
export function readActivityReferences(activityId, { token = null } = {}) {
  return request(`/teacher-admin/activities/${encodeURIComponent(activityId)}/references`, {
    token,
  });
}

/**
 * Permanently removes an archived activity nobody ever attempted.
 *
 * Not the DELETE verb, which archives. The server refuses anything that is not
 * already archived, and PostgreSQL refuses anything a learner has attempted
 * whatever the server believes.
 *
 * @param {string} activityId
 * @param {object} [options]
 * @param {string|null} [options.token]
 * @returns {Promise<object>}
 */
export function deleteActivityPermanently(activityId, { token = null } = {}) {
  return request(`/teacher-admin/activities/${encodeURIComponent(activityId)}/delete`, {
    method: "POST",
    token,
  });
}
