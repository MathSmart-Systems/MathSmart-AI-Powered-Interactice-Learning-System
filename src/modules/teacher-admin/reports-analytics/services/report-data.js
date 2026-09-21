/**
 * Server-side reads for Reports & Analytics.
 *
 * The overview is the report. The section and competency lists only fill the
 * filter menus, so if either fails the report still shows, with a note, and
 * the menu offers what it can. A failed overview is the one fatal read.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { apiParams } from "../utils/report-filters.js";
import { apiBaseUrlFrom, trimmedBaseUrl } from "../../../../lib/api/base-url.js";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_READ_ATTEMPTS = 2;

function apiBaseUrl() {
  return apiBaseUrlFrom(process.env.NEXT_PUBLIC_API_BASE_URL, trimmedBaseUrl);
}

async function serverAccessToken() {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();
    return error ? null : (data?.session?.access_token ?? null);
  } catch {
    return null;
  }
}

function transient(status) {
  return status === null || status === 408 || status === 429 || status >= 500;
}

async function read(path, token, base) {
  for (let attempt = 0; attempt < MAX_READ_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      if (attempt + 1 < MAX_READ_ATTEMPTS) continue;
      return { ok: false, status: null };
    }
    if (!response.ok) {
      if (attempt + 1 < MAX_READ_ATTEMPTS && transient(response.status)) continue;
      return { ok: false, status: response.status };
    }
    try {
      const body = await response.json();
      return { ok: true, data: body?.data ?? null };
    } catch {
      return { ok: false, status: response.status };
    }
  }
  return { ok: false, status: null };
}

export const REPORT_ERRORS = Object.freeze({
  unconfigured: "Reports are not set up for this deployment. Contact your administrator.",
  session: "Your session could not be verified. Sign in again, then try again.",
  forbidden: "Reports are available to Teacher/Administrator accounts.",
  unavailable: "The report could not be loaded. Check your connection and try again.",
});

/**
 * @param {ReturnType<import("../utils/report-filters.js").readReportFilters>} filters
 */
export async function readReport(filters) {
  const base = apiBaseUrl();
  if (!base) return { overview: null, sections: [], competencies: [], error: REPORT_ERRORS.unconfigured };

  const token = await serverAccessToken();
  if (!token) return { overview: null, sections: [], competencies: [], error: REPORT_ERRORS.session };

  const query = apiParams(filters).toString();
  const [overview, classes, competencies] = await Promise.all([
    read(`/teacher-admin/reports/overview${query ? `?${query}` : ""}`, token, base),
    read("/teacher-admin/classes", token, base),
    read("/teacher-admin/competencies?page_size=200", token, base),
  ]);

  let error = null;
  if (!overview.ok) {
    error = overview.status === 401 ? REPORT_ERRORS.session
      : overview.status === 403 ? REPORT_ERRORS.forbidden
      : REPORT_ERRORS.unavailable;
  }

  return {
    overview: overview.ok ? overview.data : null,
    // Active sections only: the report counts no one in an inactive one.
    sections: classes.ok
      ? (Array.isArray(classes.data) ? classes.data : [])
          .filter((section) => section?.is_active !== false)
          .map((section) => ({ id: section.id, name: section.name }))
      : [],
    competencies: competencies.ok
      ? (Array.isArray(competencies.data) ? competencies.data : [])
          .filter((row) => row?.status === "published")
          .map((row) => ({ id: row.id ?? row.competency_id, code: row.code, name: row.name }))
      : [],
    menusUnavailable: !classes.ok || !competencies.ok,
    error,
  };
}
