/**
 * Activity administration, as the browser calls it.
 *
 * Runs in the browser with the signed-in teacher's own Supabase access token.
 * The API verifies authorization against the project's JWKS and database RLS.
 */

import { createClient } from "@/lib/supabase/client";

import { DEFAULT_PAGE_SIZE, createApiClient, pageQuery } from "./api-client.js";

export { DEFAULT_PAGE_SIZE } from "./api-client.js";

/**
 * Resolves the configured API base URL without trailing slashes.
 *
 * @returns {string | null}
 */
function apiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
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
