/**
 * Client-side API helpers for grade and section mutations.
 *
 * The server component fetches the initial list; these helpers handle the
 * section create, the updates, and the deactivations from the browser. They read a fresh
 * Supabase access token from the session cookie and hand it to the
 * transport, which owns the request and reply shapes.
 */

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import {
  buildAdviserDirectory,
  clarifySectionFailure,
  createDirectoryClient,
  extractList,
  normalizeBaseUrl,
  sectionCreatePayload,
  sectionPatchPayload,
} from "./directory-transport.js";

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

/** One authenticated request against the MathSmart API. */
function apiRequest(method, path, body) {
  const client = createDirectoryClient({
    baseUrl: normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL),
    getAccessToken,
  });
  return client.request(method, path, body);
}

// ─── Grades ──────────────────────────────────────────────────────
//
// Read only. MathSmart teaches one grade level, seeded with the database: the
// workspace shows which one a section belongs to and never changes it, and the
// API refuses a second one.

export async function listGrades() {
  const result = await apiRequest("GET", "/teacher-admin/grades");
  return extractList(result);
}

// ─── Sections ────────────────────────────────────────────────────

export async function listSections() {
  const result = await apiRequest("GET", "/teacher-admin/sections");
  return extractList(result);
}

export async function createSection(draft) {
  const result = await apiRequest(
    "POST",
    "/teacher-admin/sections",
    sectionCreatePayload(draft),
  );
  return clarifySectionFailure(result);
}

export async function updateSection(sectionId, patch) {
  const result = await apiRequest(
    "PATCH",
    `/teacher-admin/sections/${sectionId}`,
    sectionPatchPayload(patch),
  );
  return clarifySectionFailure(result);
}

export async function deleteSection(sectionId) {
  return apiRequest("DELETE", `/teacher-admin/sections/${sectionId}`);
}

// ─── Advisers ────────────────────────────────────────────────────

/**
 * The Teacher/Administrators a section may be assigned to.
 *
 * Read from the browser as well as on the server so the choice list follows an
 * account that was added or deactivated while the page was open, instead of
 * waiting for a full reload. Keyed by `teacher_admin_id`, which is the id a
 * section's adviser_id actually references.
 */
export async function listAdvisers() {
  const result = await apiRequest(
    "GET",
    "/teacher-admin/users?role=teacher_admin&account_status=active&page_size=100",
  );
  const list = extractList(result);
  if (list.error) return { data: {}, error: list.error };
  return { data: buildAdviserDirectory(list.data), error: null };
}
