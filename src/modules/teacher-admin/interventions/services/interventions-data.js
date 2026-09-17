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

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PAGE_SIZE = 100;

function apiBaseUrl() {
  return secureApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
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
 * Reads the intervention queue and the filter directories for the page.
 *
 * @returns {Promise<{cases: Array, grades: Array, sections: Array, competencies: Array, error?: string}>}
 */
export async function readInterventionsData() {
  const base = apiBaseUrl();
  if (!base) {
    return { cases: [], grades: [], sections: [], competencies: [], error: "unconfigured" };
  }

  const token = await accessToken();
  if (!token) {
    return { cases: [], grades: [], sections: [], competencies: [], error: "session" };
  }

  const [queueRes, gradesRes, sectionsRes, competenciesRes] = await Promise.all([
    readFromApi(`/interventions?page_size=${MAX_PAGE_SIZE}`, token, base),
    readFromApi("/teacher-admin/grades?page_size=200", token, base),
    readFromApi("/teacher-admin/sections?page_size=200", token, base),
    readFromApi(`/teacher-admin/competencies?page_size=${MAX_PAGE_SIZE}`, token, base),
  ]);

  return {
    cases: queueRes.ok && Array.isArray(queueRes.data) ? queueRes.data : [],
    grades: gradesRes.ok ? gradesRes.data : [],
    sections: sectionsRes.ok ? sectionsRes.data : [],
    competencies: competenciesRes.ok ? competenciesRes.data : [],
    error:
      !queueRes.ok && !gradesRes.ok && !sectionsRes.ok && !competenciesRes.ok
        ? "unavailable"
        : undefined,
  };
}