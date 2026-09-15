/**
 * Server-side reads for the Teacher/Administrator Students workspace.
 *
 * This module runs only on the server. It forwards the caller's own Supabase
 * access token to the MathSmart API for the roster, the grade directory and the
 * section directory; it never touches a secret key and never decides a learner
 * record of its own.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const REQUEST_TIMEOUT_MS = 10_000;
const ROSTER_PAGE_SIZE = 100;

function apiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
}

async function accessToken() {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();
    return error ? null : (data?.session?.access_token ?? null);
  } catch {
    return null;
  }
}

async function readFromApi(path, token, base) {
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: null };
  }

  if (!response.ok) return { ok: false, status: response.status };

  try {
    const body = await response.json();
    return { ok: true, data: body?.data ?? [], meta: body?.meta };
  } catch {
    return { ok: false, status: response.status };
  }
}

function rosterQuery(gradeId, sectionId) {
  const params = new URLSearchParams({ page_size: String(ROSTER_PAGE_SIZE) });
  if (gradeId) params.set("grade_id", gradeId);
  if (sectionId) params.set("section_id", sectionId);
  return `/students?${params.toString()}`;
}

/**
 * Reads the initial roster, grade directory and section directory.
 *
 * @returns {Promise<{learners: Array, grades: Array, sections: Array, rosterTruncated?: boolean, error?: string}>}
 */
export async function readStudentsData({ gradeId = null, sectionId = null } = {}) {
  const base = apiBaseUrl();

  if (!base) {
    return { learners: [], grades: [], sections: [], error: "unconfigured" };
  }

  const token = await accessToken();
  if (!token) {
    return { learners: [], grades: [], sections: [], error: "session" };
  }

  const [rosterRes, gradesRes, sectionsRes] = await Promise.all([
    readFromApi(rosterQuery(gradeId, sectionId), token, base),
    readFromApi("/teacher-admin/grades", token, base),
    readFromApi("/teacher-admin/sections", token, base),
  ]);

  const total = rosterRes.meta?.total_items ?? rosterRes.data?.length ?? 0;

  return {
    learners: rosterRes.ok ? rosterRes.data : [],
    grades: gradesRes.ok ? gradesRes.data : [],
    sections: sectionsRes.ok ? sectionsRes.data : [],
    rosterTruncated: rosterRes.ok && total > (rosterRes.data?.length ?? 0),
    error: !rosterRes.ok ? "unavailable" : undefined,
  };
}