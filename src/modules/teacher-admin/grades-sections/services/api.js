/**
 * Client-side API helpers for grade and section mutations.
 *
 * The server component fetches the initial list; these helpers handle
 * create, update, and delete from the browser. They read a fresh
 * Supabase access token from the session cookie and forward it to
 * the MathSmart API.
 */

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const REQUEST_TIMEOUT_MS = 30_000; // Increased from 10 seconds to 30 seconds

function apiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
}

async function getAccessToken() {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    return error ? null : (data?.session?.access_token ?? null);
  } catch {
    return null;
  }
}

/**
 * One authenticated request against the MathSmart API.
 *
 * @returns {Promise<{ok: boolean, data?: unknown, status?: number|null, error?: string}>}
 */
async function apiRequest(method, path, body) {
  const base = apiBaseUrl();
  if (!base) return { ok: false, status: null, error: "API not configured" };

  const token = await getAccessToken();
  if (!token) return { ok: false, status: null, error: "Session not available" };

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const detail = cause?.cause?.message || cause?.message || cause?.name || "Network request failed";
    return { ok: false, status: null, error: `Service unavailable (${detail})` };
  }

  const status = response.status;

  if (status === 204) return { ok: true, status };

  let json;
  try {
    json = await response.json();
  } catch {
    return { ok: false, status, error: `Server error (${status})` };
  }

  if (!response.ok) {
    const message = json?.error?.message || json?.detail || `Request failed with status ${status}`;
    return { ok: false, status, error: message };
  }

  return { ok: true, status, data: json?.data ?? json };
}

/** Extract the list from a collection envelope. */
function extractList(response) {
  if (!response.ok) return { data: [], error: response.error ?? "Request failed" };
  const payload = response.data;
  const list = Array.isArray(payload) ? payload : payload?.data ?? [];
  return { data: list, error: null };
}

// ─── Grades ──────────────────────────────────────────────────────

export async function listGrades() {
  const result = await apiRequest("GET", "/teacher-admin/grades");
  return extractList(result);
}

export async function createGrade({ name, level, is_active }) {
  return apiRequest("POST", "/teacher-admin/grades", { name, level, is_active });
}

export async function updateGrade(gradeId, patch) {
  return apiRequest("PATCH", `/teacher-admin/grades/${gradeId}`, patch);
}

export async function deleteGrade(gradeId) {
  return apiRequest("DELETE", `/teacher-admin/grades/${gradeId}`);
}

// ─── Sections ────────────────────────────────────────────────────

export async function listSections() {
  const result = await apiRequest("GET", "/teacher-admin/sections");
  return extractList(result);
}

export async function createSection({ grade_id, name, adviser_id, is_active }) {
  // Clean up adviser_id: convert empty string to undefined so it's omitted from JSON
  const payload = {
    grade_id,
    name,
    is_active,
  };
  // Only include adviser_id if it's a non-empty string (UUID)
  if (adviser_id && adviser_id.trim()) {
    payload.adviser_id = adviser_id;
  }
  
  const result = await apiRequest("POST", "/teacher-admin/sections", payload);
  
  // Provide better error messages for common issues
  if (!result.ok && result.error) {
    // Check for common database constraint errors
    if (result.error.includes('foreign key') || result.error.includes('violates')) {
      if (result.error.includes('adviser')) {
        result.error = "The selected adviser is invalid or has been removed. Please choose another or leave unassigned.";
      } else if (result.error.includes('grade')) {
        result.error = "The selected grade level is invalid. Please refresh the page and try again.";
      }
    }
  }
  
  return result;
}

export async function updateSection(sectionId, patch) {
  // Clean up adviser_id in patch: convert empty string to undefined
  const cleanPatch = { ...patch };
  if ('adviser_id' in cleanPatch && (!cleanPatch.adviser_id || !cleanPatch.adviser_id.trim())) {
    cleanPatch.adviser_id = null; // Explicitly set to null to clear adviser
  }
  return apiRequest("PATCH", `/teacher-admin/sections/${sectionId}`, cleanPatch);
}

export async function deleteSection(sectionId) {
  return apiRequest("DELETE", `/teacher-admin/sections/${sectionId}`);
}
