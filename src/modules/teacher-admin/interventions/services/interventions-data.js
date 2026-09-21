/**
 * Server-side reads for the Teacher Interventions workspace.
 *
 * Runs only on the server. It forwards the caller's own Supabase access token
 * to the MathSmart API for the deterministic intervention queue and the filter
 * directories (grades, sections, competencies). It never touches a secret key,
 * and it never decides severity, status, or queue membership — the API does.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { secureApiBaseUrl } from "@/modules/shared/utils/api-url";

import { filtersFromQuery } from "../utils/intervention-helpers";
import { apiBaseUrlFrom } from "../../../../lib/api/base-url.js";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PAGE_SIZE = 100;

function apiBaseUrl() {
  return apiBaseUrlFrom(process.env.NEXT_PUBLIC_API_BASE_URL, secureApiBaseUrl);
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
    return { ok: true, data: body?.data ?? body, meta: body?.meta };
  } catch {
    return { ok: false, status: response.status };
  }
}

/**
 * The queue request for one filter set, as the API spells its parameters.
 *
 * The filters arrive in the address, so the first render already has them.
 * Reading them here is what makes a filtered queue survive a refresh, a
 * bookmark, and coming back from a case, instead of flashing the whole queue
 * and then narrowing it once the browser catches up.
 */
function queuePath(filters) {
  const query = new URLSearchParams({ page_size: String(MAX_PAGE_SIZE) });
  const named = {
    student_id: filters.studentId,
    grade_id: filters.gradeId,
    section_id: filters.sectionId,
    competency_id: filters.competencyId,
    severity: filters.severity,
    status: filters.status,
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
    min_attempts: filters.minAttempts,
    min_score_drop: filters.minScoreDrop,
  };
  for (const [name, value] of Object.entries(named)) {
    if (value !== null && value !== undefined && String(value) !== "") {
      query.set(name, String(value));
    }
  }
  return `/interventions?${query.toString()}`;
}

/**
 * Reads the intervention queue and the filter directories for the page.
 *
 * @param {Record<string, string>|URLSearchParams|null} [query] - The page's search params
 * @returns {Promise<{cases: Array, grades: Array, sections: Array, competencies: Array, filters: object, error?: string}>}
 */
export async function readInterventionsData(query = null) {
  const filters = filtersFromQuery(
    query instanceof URLSearchParams ? query : new URLSearchParams(query ?? {}),
  );

  const empty = { cases: [], grades: [], sections: [], competencies: [], filters };

  const base = apiBaseUrl();
  if (!base) return { ...empty, error: "unconfigured" };

  const token = await accessToken();
  if (!token) return { ...empty, error: "session" };

  const [queueRes, gradesRes, sectionsRes, competenciesRes] = await Promise.all([
    readFromApi(queuePath(filters), token, base),
    readFromApi("/teacher-admin/grades?page_size=200", token, base),
    readFromApi("/teacher-admin/sections?page_size=200", token, base),
    readFromApi(`/teacher-admin/competencies?page_size=${MAX_PAGE_SIZE}`, token, base),
  ]);

  // Every one of these is documented as an array, and the filters map over
  // each list, so a 2xx body that is not an array is a failure for this page.
  const list = (result) => (result.ok && Array.isArray(result.data) ? result.data : []);
  const queueOk = queueRes.ok && Array.isArray(queueRes.data);

  return {
    cases: list(queueRes),
    filters,
    grades: list(gradesRes),
    sections: list(sectionsRes),
    competencies: list(competenciesRes),
    // A queue failure is this page's own outage and must be reported, whatever
    // the directories did. A directory failure alone degrades to empty filters.
    error: queueOk ? undefined : "unavailable",
  };
}