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
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
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

const PREFERENCES_KEY = "mathsmart.teacher_preferences";

/**
 * Reads saved display preferences from localStorage.
 *
 * @param {object} [fallback]
 * @returns {object}
 */
export function loadDisplayPreferences(fallback = {}) {
  if (typeof window === "undefined") {
    return { ...fallback };
  }
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return { ...fallback };
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return { ...fallback };
  }
}

/**
 * Applies the active theme (light, dark, or system) to the document root element.
 *
 * @param {string} [theme]
 */
export function applyTheme(theme = "light") {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

/**
 * Saves display preferences to localStorage and updates DOM styling.
 *
 * @param {object} prefs
 */
export function saveDisplayPreferences(prefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Safe fallback
  }
  if (prefs?.theme) {
    applyTheme(prefs.theme);
  }
}

