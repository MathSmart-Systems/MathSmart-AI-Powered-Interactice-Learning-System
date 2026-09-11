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

const REQUEST_TIMEOUT_MS = 10_000;

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
  } catch {
    return { ok: false, status: null, error: "Service unavailable" };
  }

  const status = response.status;

  if (status === 204) return { ok: true, status };

  let json;
  try {
    json = await response.json();
  } catch {
    return { ok: false, status, error: "Invalid response" };
  }

  if (!response.ok) {
    const message = json?.error?.message || "Request failed";
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
  return apiRequest("POST", "/teacher-admin/sections", { grade_id, name, adviser_id, is_active });
}

export async function updateSection(sectionId, patch) {
  return apiRequest("PATCH", `/teacher-admin/sections/${sectionId}`, patch);
}

export async function deleteSection(sectionId) {
  return apiRequest("DELETE", `/teacher-admin/sections/${sectionId}`);
}
