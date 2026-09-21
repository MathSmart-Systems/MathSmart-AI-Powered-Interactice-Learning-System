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

import { mvpGrade, rosterStatus } from "../utils/roster";
import { apiBaseUrlFrom, trimmedBaseUrl } from "../../../../lib/api/base-url.js";

const REQUEST_TIMEOUT_MS = 10_000;
const ROSTER_PAGE_SIZE = 100;

function apiBaseUrl() {
  return apiBaseUrlFrom(process.env.NEXT_PUBLIC_API_BASE_URL, trimmedBaseUrl);
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

function rosterQuery(gradeId, sectionId, status) {
  const params = new URLSearchParams({ page_size: String(ROSTER_PAGE_SIZE) });
  if (gradeId) params.set("grade_id", gradeId);
  if (sectionId) params.set("section_id", sectionId);
  params.set("status", rosterStatus(status));
  return `/students?${params.toString()}`;
}

/**
 * Reads the initial roster, grade directory and section directory.
 *
 * @returns {Promise<{learners: Array, grades: Array, sections: Array, sectionCounts?: Array, rosterTotal?: number, rosterTruncated?: boolean, error?: string}>}
 */
export async function readStudentsData({ sectionId = null, status } = {}) {
  const base = apiBaseUrl();

  if (!base) {
    return { learners: [], grades: [], sections: [], error: "unconfigured" };
  }

  const token = await accessToken();
  if (!token) {
    return { learners: [], grades: [], sections: [], error: "session" };
  }

  // The directories first, because the roster has to be asked for by grade and
  // the canonical Grade 6 id is what makes that possible. MathSmart teaches one
  // grade; a roster read without that filter answers with every learner a
  // deployment has ever held, including ones left behind by legacy data.
  const [gradesRes, sectionsRes] = await Promise.all([
    readFromApi("/teacher-admin/grades", token, base),
    readFromApi("/teacher-admin/sections", token, base),
  ]);

  const grade = mvpGrade(gradesRes.ok ? gradesRes.data : []);

  // No Grade 6 record means there is no roster to show. Reading one anyway
  // would show learners from grades this deployment does not teach, which is
  // worse than the plain message the view already has for this case.
  if (!grade) {
    return {
      learners: [],
      grades: gradesRes.ok ? gradesRes.data : [],
      sections: sectionsRes.ok ? sectionsRes.data : [],
      sectionCounts: [],
      rosterTotal: 0,
      rosterTruncated: false,
      error: undefined,
    };
  }

  const rosterRes = await readFromApi(
    rosterQuery(grade.grade_id, sectionId, status),
    token,
    base,
  );

  // The API's own count, not the length of the page it returned. A roster of
  // 400 learners answers with 100 rows and a total of 400, and the difference
  // is the whole point of the message the view shows.
  const total = rosterRes.meta?.total_items ?? rosterRes.data?.length ?? 0;

  return {
    learners: rosterRes.ok ? rosterRes.data : [],
    grades: gradesRes.ok ? gradesRes.data : [],
    sections: sectionsRes.ok ? sectionsRes.data : [],
    // How many learners each section holds, counted across the whole roster
    // rather than the page. A section header that offers "select all" has to
    // say a true number, and the page is only the first hundred.
    sectionCounts: rosterRes.ok ? (rosterRes.meta?.sections ?? []) : [],
    rosterTotal: rosterRes.ok ? total : 0,
    rosterTruncated: rosterRes.ok && total > (rosterRes.data?.length ?? 0),
    error: !rosterRes.ok ? "unavailable" : undefined,
  };
}