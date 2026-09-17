/**
 * Client-side API helpers for the Teacher/Administrator Dashboard.
 * Uses createClient from @/lib/supabase/client for browser execution.
 */

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { buildDashboardModel } from "../utils/dashboard-model.js";

const REQUEST_TIMEOUT_MS = 10_000;

function apiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
}

async function browserAccessToken() {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
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
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: null };
  }

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  try {
    const body = await response.json();
    return { ok: true, data: body?.data ?? null };
  } catch {
    return { ok: false, status: response.status };
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
 * Client-side fetcher for interactive section/grade filter switches.
 *
 * @param {object} [params]
 * @param {string|null} [params.gradeId]
 * @param {string|null} [params.sectionId]
 * @param {Array} [existingSections]
 * @returns {Promise<{ok: boolean, model?: object, error?: string}>}
 */
export async function fetchDashboardClient({
  gradeId = null,
  sectionId = null,
  existingSections = [],
} = {}) {
  const base = apiBaseUrl();
  if (!base) {
    return { ok: false, error: "API base URL not configured" };
  }

  const token = await browserAccessToken();
  if (!token) {
    return { ok: false, error: "Authentication session expired" };
  }

  const dashboardRes = await readFromApi(
    buildDashboardQuery(gradeId, sectionId),
    token,
    base
  );

  if (!dashboardRes.ok) {
    return { ok: false, error: "Unable to refresh dashboard" };
  }

  const dashboardData = dashboardRes.data || {};
  const model = buildDashboardModel({
    totals: dashboardData.totals || {},
    competencies: dashboardData.competencies || [],
    priorityLearners: dashboardData.priority_learners || [],
    // existingSections is a page-load snapshot from the server render.
    // It is intentionally reused here to avoid a second GET /teacher-admin/classes
    // on every section filter change. If real-time section list updates are needed,
    // re-fetch /teacher-admin/classes inside this function and pass the result instead.
    sections: existingSections,
    selectedSectionId: sectionId,
  });

  return { ok: true, model };
}
