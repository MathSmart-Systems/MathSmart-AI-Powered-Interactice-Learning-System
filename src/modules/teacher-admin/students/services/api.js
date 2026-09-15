/**
 * Client-side API helpers for the Teacher/Administrator Students workspace.
 *
 * The server component fetches the initial roster; these helpers handle
 * filtering and enrollment mutations from the browser. They read a fresh
 * Supabase access token from the session cookie and forward it to the
 * MathSmart API.
 *
 * Enrolment is idempotent: `POST /students` needs an `Idempotency-Key` header,
 * so a retried request returns the original creation instead of provisioning a
 * second account.
 */

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const REQUEST_TIMEOUT_MS = 30_000;

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

/** A fresh key for one enrolment request; a UUID is long enough and unique. */
function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `enrol-${Date.now()}`;
}

/** Build a query string from the filter values that are set. */
function rosterQuery({ gradeId, sectionId }) {
  const params = new URLSearchParams({ page_size: "100" });
  if (gradeId) params.set("grade_id", gradeId);
  if (sectionId) params.set("section_id", sectionId);
  return `/students?${params.toString()}`;
}

/**
 * One authenticated request against the MathSmart API.
 *
 * @returns {Promise<{ok: boolean, data?: unknown, status?: number|null, error?: string}>}
 */
async function apiRequest(method, path, { body, extraHeaders } = {}) {
  const base = apiBaseUrl();
  if (!base) return { ok: false, status: null, error: "API not configured" };

  const token = await getAccessToken();
  if (!token) return { ok: false, status: null, error: "Session not available" };

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...extraHeaders,
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
    const detail =
      cause?.cause?.message || cause?.message || cause?.name || "Network request failed";
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

  return { ok: true, status, data: json?.data ?? json, meta: json?.meta };
}

/** The learner list from a collection envelope, plus the total it claims. */
function extractRoster(response) {
  if (!response.ok) return { data: [], total: 0, error: response.error ?? "Request failed" };
  const payload = response.data;
  const list = Array.isArray(payload) ? payload : payload?.data ?? [];
  return { data: list, total: response.meta?.total_items ?? list.length, error: null };
}

export async function listStudents({ gradeId = null, sectionId = null } = {}) {
  const result = await apiRequest("GET", rosterQuery({ gradeId, sectionId }));
  return extractRoster(result);
}

/**
 * Enrol a learner. The request must carry an `Idempotency-Key`, so a browser
 * retry after a network blip cannot create a duplicate account.
 */
export async function createStudent({ email, full_name, learner_id, grade_id, section_id, school_name }) {
  const payload = {
    email,
    full_name,
    learner_id,
    grade_id,
  };
  if (section_id) payload.section_id = section_id;
  if (school_name && school_name.trim()) payload.school_name = school_name.trim();

  return apiRequest("POST", "/students", {
    body: payload,
    extraHeaders: { "Idempotency-Key": newIdempotencyKey() },
  });
}

export async function updateStudent(studentId, patch) {
  return apiRequest("PATCH", `/students/${studentId}`, { body: patch });
}