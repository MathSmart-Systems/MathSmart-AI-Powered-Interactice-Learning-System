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

/**
 * Server-side loader for the Teacher Dashboard.
 *
 * @param {object} [params]
 * @param {string|null} [params.gradeId]
 * @param {string|null} [params.sectionId]
 * @returns {Promise<{state: string, model: object, error?: string}>}
 */
export async function readDashboardData({ gradeId = null, sectionId = null } = {}) {
  const base = apiBaseUrl();
  if (!base) {
    return {
      state: DASHBOARD_STATE.ERROR,
      model: buildDashboardModel(),
      error: "API base URL is not configured.",
    };
  }

  const token = await serverAccessToken();
  if (!token) {
    return {
      state: DASHBOARD_STATE.ERROR,
      model: buildDashboardModel(),
      error: "Authentication session unavailable.",
    };
  }

  const [dashboardRes, classesRes] = await Promise.all([
    readFromApi(buildDashboardQuery(gradeId, sectionId), token, base),
    readFromApi("/teacher-admin/classes", token, base),
  ]);

  if (!dashboardRes.ok) {
    return {
      state: DASHBOARD_STATE.ERROR,
      model: buildDashboardModel(),
      error: "Unable to load dashboard data from service.",
    };
  }

  const dashboardData = dashboardRes.data || {};
  const sectionsData = classesRes.ok && Array.isArray(classesRes.data) ? classesRes.data : [];

  const model = buildDashboardModel({
    totals: dashboardData.totals || {},
    competencies: dashboardData.competencies || [],
    priorityLearners: dashboardData.priority_learners || [],
    sections: sectionsData,
    selectedSectionId: sectionId,
  });

  return {
    state: model.hasData ? DASHBOARD_STATE.READY : DASHBOARD_STATE.EMPTY,
    model,
    classesUnavailable: !classesRes.ok,
  };
}
