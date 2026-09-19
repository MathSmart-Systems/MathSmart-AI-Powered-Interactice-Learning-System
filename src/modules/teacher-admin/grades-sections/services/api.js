/**
 * Client-side API helpers for grade and section mutations.
 *
 * The server component fetches the initial list; these helpers handle
 * create, update, and deactivate from the browser. They read a fresh
 * Supabase access token from the session cookie and hand it to the
 * transport, which owns the request and reply shapes.
 */

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import {
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
