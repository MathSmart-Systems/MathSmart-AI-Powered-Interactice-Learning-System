/**
 * Activity administration, as the browser calls it.
 *
 * Runs in the browser with the signed-in teacher's own Supabase access token.
 * The API verifies authorization against the project's JWKS and database RLS.
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
 * Read per request rather than captured once, so a refreshed token is sent.
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
 * One page of activities. Search, status, and paging are handled on the server.
 */
export function listActivities({
  search = "",
  status = null,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  token = null,
} = {}) {
  return request(
    `/teacher-admin/activities?${pageQuery({ search, status, page, pageSize })}`,
    { token }
  );
}

/** One activity draft by ID. */
export function getActivity(activityId, { token = null } = {}) {
  return request(`/teacher-admin/activities/${encodeURIComponent(activityId)}`, { token });
}

/** Create a new activity draft. */
export function createActivity(draft, { token = null } = {}) {
  return request("/teacher-admin/activities", { method: "POST", body: draft, token });
}

/** Update an existing activity draft. */
export function updateActivity(activityId, changes, { token = null } = {}) {
  return request(`/teacher-admin/activities/${encodeURIComponent(activityId)}`, {
    method: "PATCH",
    body: changes,
    token,
  });
}

/** Archive an activity (DELETE sets status = 'archived'). */
export function archiveActivity(activityId, { token = null } = {}) {
  return request(`/teacher-admin/activities/${encodeURIComponent(activityId)}`, {
    method: "DELETE",
    token,
  });
}

/**
 * List learning modules to populate the module dropdown when authoring activities.
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
