/**
 * Server-side data access for the Teacher/Administrator Dashboard.
 * Runs exclusively on the server with next/headers session cookies.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { DASHBOARD_STATE } from "../utils/constants.js";
import { buildDashboardModel } from "../utils/dashboard-model.js";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_READ_ATTEMPTS = 2;

function isTransientFailure(status) {
  return status === null || status === 408 || status === 429 || status >= 500;
}

function apiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
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

async function readFromApi(path, token, base) {
  for (let attempt = 0; attempt < MAX_READ_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      if (attempt + 1 < MAX_READ_ATTEMPTS) continue;
      return { ok: false, status: null };
    }

    if (!response.ok) {
      if (attempt + 1 < MAX_READ_ATTEMPTS && isTransientFailure(response.status)) continue;
      return { ok: false, status: response.status };
    }

    try {
      const body = await response.json();
      return { ok: true, data: body?.data ?? null };
    } catch {
      return { ok: false, status: response.status };
    }
  }
}

function buildDashboardQuery(gradeId, sectionId) {
  const params = new URLSearchParams();
  if (gradeId) params.set("grade_id", gradeId);
  if (sectionId) params.set("section_id", sectionId);
  const qs = params.toString();
  return qs ? `/teacher-admin/dashboard?${qs}` : "/teacher-admin/dashboard";
}

/** Why the dashboard could not be read, in words a teacher can act on. */
export const DASHBOARD_ERROR = Object.freeze({
  unconfigured: "The dashboard service is not configured for this deployment.",
  session: "Your session has ended. Sign in again to see the dashboard.",
  forbidden: "The dashboard is available to Teacher/Administrator accounts.",
  unavailable: "The dashboard could not be loaded. Try again in a moment.",
});

function reasonFor(status) {
  if (status === 401) return "session";
  if (status === 403) return "forbidden";
  return "unavailable";
}

/**
 * Server-side loader for the Teacher Dashboard.
 *
 * The section comes from the address, so a filtered dashboard survives a
 * refresh, a bookmark and the back button, and the first thing painted is the
 * section the teacher asked for rather than the whole school.
 *
 * A failed dashboard read is an error, never a page of zeros. The section
 * directory is read beside it and returned even then, so the filter stays on
 * screen and a teacher can pick a different section or try again without
 * losing the page around them.
 *
 * @param {object} [params]
 * @param {string|null} [params.sectionId]
 * @returns {Promise<{state: string, model: object, error?: string, classesUnavailable?: boolean}>}
 */
export async function readDashboardData({ sectionId = null } = {}) {
  const base = apiBaseUrl();
  if (!base) {
    return {
      state: DASHBOARD_STATE.ERROR,
      model: buildDashboardModel(),
      error: DASHBOARD_ERROR.unconfigured,
    };
  }

  const token = await serverAccessToken();
  if (!token) {
    return {
      state: DASHBOARD_STATE.ERROR,
      model: buildDashboardModel(),
      error: DASHBOARD_ERROR.session,
    };
  }

  const [dashboardRes, classesRes] = await Promise.all([
    readFromApi(buildDashboardQuery(null, sectionId), token, base),
    readFromApi("/teacher-admin/classes", token, base),
  ]);

  const sections = classesRes.ok && Array.isArray(classesRes.data) ? classesRes.data : [];

  if (!dashboardRes.ok || !dashboardRes.data || typeof dashboardRes.data !== "object") {
    return {
      state: DASHBOARD_STATE.ERROR,
      model: buildDashboardModel({ sections, selectedSectionId: sectionId }),
      error: DASHBOARD_ERROR[reasonFor(dashboardRes.status)],
      classesUnavailable: !classesRes.ok,
    };
  }

  return {
    state: DASHBOARD_STATE.READY,
    model: buildDashboardModel({
      dashboard: dashboardRes.data,
      sections,
      selectedSectionId: sectionId,
    }),
    classesUnavailable: !classesRes.ok,
  };
}
