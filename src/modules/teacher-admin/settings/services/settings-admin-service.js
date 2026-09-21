/**
 * Settings administration service for the browser.
 *
 * Runs with the signed-in teacher's Supabase access token.
 */

import { createClient } from "@/lib/supabase/client";

import { createApiClient } from "./api-client.js";

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
 * Instantiates the settings API client.
 *
 * @returns {object}
 */
function client() {
  return createApiClient({ baseUrl: apiBaseUrl(), getAccessToken: accessToken });
}

/**
 * Fetches the current effective settings.
 *
 * @param {object} [options]
 * @param {string|null} [options.token] - Optional explicit auth token override
 * @returns {Promise<object>}
 */
export async function fetchSettings({ token = null } = {}) {
  return client().request("/teacher-admin/settings", { method: "GET", token });
}

/**
 * Updates system settings.
 *
 * @param {Record<string, any>} settingsMap
 * @param {object} [options]
 * @param {string|null} [options.token] - Optional explicit auth token override
 * @returns {Promise<object>}
 */
export async function updateSettings(settingsMap, { token = null } = {}) {
  return client().request("/teacher-admin/settings", {
    method: "PATCH",
    body: { settings: settingsMap },
    token,
  });
}

/**
 * Fetches recent audit events for settings updates.
 *
 * @param {object} [options]
 * @param {string|null} [options.token]
 * @param {number} [options.pageSize]
 * @returns {Promise<object>}
 */
export async function fetchSettingsAuditEvents({ token = null, pageSize = 10 } = {}) {
  return client().request(
    `/teacher-admin/audit-events?action=settings.updated&page_size=${encodeURIComponent(pageSize)}`,
    { method: "GET", token }
  );
}

/**
 * Fetches the authenticated teacher's profile and institutional context.
 *
 * @param {object} [options]
 * @param {string|null} [options.token]
 * @returns {Promise<object>}
 */
export async function fetchOwnProfile({ token = null } = {}) {
  return client().request("/auth/me", { method: "GET", token });
}

/**
 * Updates the authenticated teacher's display name.
 *
 * @param {string} fullName
 * @param {object} [options]
 * @param {string|null} [options.token]
 * @returns {Promise<object>}
 */
export async function updateOwnProfile(fullName, { token = null } = {}) {
  return client().request("/auth/me", {
    method: "PATCH",
    body: { full_name: fullName },
    token,
  });
}

/**
 * Withdraws the signed-in user's own pending sign-in email change.
 *
 * Done by the MathSmart API as the user, not with any Supabase key in the
 * browser: the database clears the pending address and both confirmation
 * links for this account only, and leaves the sign-in email as it is.
 *
 * @returns {Promise<object>} `data.cancelled` is false when nothing was pending
 */
export async function cancelEmailChange({ token = null } = {}) {
  return client().request("/auth/me/email-change/cancel", { method: "POST", token });
}

/**
 * Updates the user's password directly through Supabase Auth.
 *
 * @param {string} newPassword
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function updateOwnPassword(newPassword) {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: cause?.message || "Failed to update password." };
  }
}

/**
 * The signed-in account as Supabase Auth knows it, fetched fresh.
 *
 * `email` is the confirmed sign-in address. `new_email` is a change still
 * waiting for confirmation and is never the account's email.
 *
 * @returns {Promise<{email: string|null, new_email: string|null}|null>}
 */
export async function readSignedInAccount() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return { email: data.user.email ?? null, new_email: data.user.new_email ?? null };
  } catch {
    return null;
  }
}

/**
 * Asks Supabase to change the sign-in email.
 *
 * This is the browser client with the public key and the teacher's own
 * session; nothing elevated is involved. With Secure Email Change on,
 * Supabase sends a link to both addresses and changes nothing until both are
 * followed. The links come back to a route that only handles this.
 *
 * @param {string} email - Already validated and normalised
 * @returns {Promise<{error: object|null}>}
 */
export async function requestEmailChange(email) {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${window.location.origin}/auth/email-change/confirm` },
    );
    return { error: error ?? null };
  } catch {
    return { error: { status: 0, code: "unreachable" } };
  }
}

export {
  applyDensity,
  applyTheme,
  loadDisplayPreferences,
  loadTeacherAvatar,
  PREFERENCES_KEY,
  saveDisplayPreferences,
  saveTeacherAvatar,
  TEACHER_AVATAR_KEY,
} from "../utils/preferences-storage.js";
import { apiBaseUrlFrom, trimmedBaseUrl } from "../../../../lib/api/base-url.js";

