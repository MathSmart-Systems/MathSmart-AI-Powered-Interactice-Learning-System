/**
 * Client-side API helpers for the Teacher/Administrator Students workspace.
 *
 * The server component fetches the initial roster; these helpers handle
 * filtering and enrollment mutations from the browser. They read a fresh
 * Supabase access token from the session cookie and forward it to the
 * MathSmart API.
 *
 * Enrollment is idempotent: `POST /students` needs an `Idempotency-Key` header,
 * so a retried request returns the original creation instead of provisioning a
 * second account.
 */

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { rosterStatus } from "../utils/roster";
import { apiBaseUrlFrom, trimmedBaseUrl } from "../../../../lib/api/base-url.js";

const REQUEST_TIMEOUT_MS = 30_000;

function apiBaseUrl() {
  return apiBaseUrlFrom(process.env.NEXT_PUBLIC_API_BASE_URL, trimmedBaseUrl);
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

/** A fresh key for one enrollment request; a UUID is long enough and unique. */
function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `enroll-${Date.now()}`;
}

/** Build a query string from the filter values that are set. */
function rosterQuery({ gradeId, sectionId, status }) {
  const params = new URLSearchParams({ page_size: "100" });
  if (gradeId) params.set("grade_id", gradeId);
  if (sectionId) params.set("section_id", sectionId);
  params.set("status", rosterStatus(status));
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
  if (!response.ok) {
    return { data: [], total: 0, sections: [], error: response.error ?? "Request failed" };
  }
  const payload = response.data;
  const list = Array.isArray(payload) ? payload : payload?.data ?? [];
  return {
    data: list,
    total: response.meta?.total_items ?? list.length,
    // Counted by the API across the whole roster, not the page it returned.
    // A section header offering "select all" needs a true number.
    sections: response.meta?.sections ?? [],
    error: null,
  };
}

export async function listStudents({ gradeId = null, sectionId = null, status } = {}) {
  const result = await apiRequest("GET", rosterQuery({ gradeId, sectionId, status }));
  return extractRoster(result);
}

/**
 * Enroll a learner. The request must carry an `Idempotency-Key`, so a browser
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

/**
 * One learner's record: identity and enrollment, nothing else.
 *
 * `GET /students/{id}` is Teacher/Administrator-only and runs under the
 * caller's own row-level policies, so a learner they may not see is a 404
 * rather than a partial answer.
 */
export async function fetchStudent(studentId) {
  return apiRequest("GET", `/students/${studentId}`);
}

/**
 * One learner's deterministic progress evidence.
 *
 * Scores, mastery bands, growth and attempt counts all come from here and are
 * never inferred in the browser. Nothing on this path involves Groq.
 */
export async function fetchStudentProgress(studentId) {
  return apiRequest("GET", `/progress/${studentId}`);
}

/**
 * Drops learners from the school.
 *
 * Archives the accounts rather than deleting them, which is the only
 * retirement this data model has: seven tables reference a learner's recorded
 * work and every one of those foreign keys is ON DELETE RESTRICT, so a learner
 * who has attempted anything cannot be removed without destroying the class
 * reporting that points at them. Archiving stops the account being usable —
 * the account-status check refuses its next request — it takes the learner off
 * the roster, and it is reversible.
 *
 * One target per request: `{ section_id }` for a whole class, or
 * `{ user_ids }` for named accounts. Naming a section rather than expanding it
 * here is deliberate — the roster is paginated, so a browser that sent ids
 * would send the page it had loaded and quietly leave the rest enrolled.
 *
 * @param {{section_id?: string, user_ids?: string[]}} target
 */
export async function dropStudents(target) {
  return apiRequest("POST", "/students/drop", { body: target });
}

/**
 * Puts a dropped learner back on the roster.
 *
 * The destination section is required rather than inferred: a learner's former
 * section may have been retired, or may belong to another grade, by the time
 * anybody restores them. Nothing recorded about the learner is recalculated —
 * this returns their access, their monitoring and their placement, and touches
 * no score, attempt or intervention.
 */
export async function restoreStudent(studentId, sectionId) {
  return apiRequest("POST", `/students/${studentId}/restore`, {
    body: { section_id: sectionId },
  });
}

/**
 * What a permanent purge would remove, counted before anything is.
 *
 * Read so the confirmation can say what is actually about to be destroyed
 * rather than warn in the abstract.
 */
export async function previewPurge(studentId) {
  return apiRequest("GET", `/students/${studentId}/purge-preview`);
}

/**
 * Permanently removes one dropped learner.
 *
 * The learner being purged is the one named in the path; `learner_id` is the
 * teacher's typed confirmation and is checked against the record the server
 * reads for itself. Safe to send again after a failure — the server records
 * the operation before the first deletion and resumes from where it stopped.
 */
export async function purgeStudent(studentId, { learnerId, acknowledged }) {
  return apiRequest("POST", `/students/${studentId}/purge`, {
    body: { learner_id: learnerId, acknowledged: Boolean(acknowledged) },
  });
}
