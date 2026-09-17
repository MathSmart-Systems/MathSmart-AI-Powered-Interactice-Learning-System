import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const REQUEST_TIMEOUT_MS = 10_000;

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
    return { ok: true, data: body?.data ?? body, meta: body?.meta };
  } catch {
    return { ok: false, status: response.status };
  }
}

export async function readReportsData({ gradeId = null, sectionId = null } = {}) {
  const base = apiBaseUrl();
  if (!base) {
    return { dashboard: null, analytics: null, sections: [], error: "unconfigured" };
  }

  const token = await accessToken();
  if (!token) {
    return { dashboard: null, analytics: null, sections: [], error: "session" };
  }

  const sectionParams = sectionId ? `?section_id=${sectionId}` : gradeId ? `?grade_id=${gradeId}` : "";
  const analyticsParams = sectionId
    ? `?section_id=${sectionId}`
    : gradeId
      ? `?grade_id=${gradeId}`
      : "";

  const [dashboardRes, analyticsRes, sectionsRes] = await Promise.all([
    readFromApi(`/teacher-admin/dashboard${sectionParams}`, token, base),
    readFromApi(`/teacher-admin/analytics${analyticsParams}`, token, base),
    readFromApi("/teacher-admin/classes", token, base),
  ]);

  return {
    dashboard: dashboardRes.ok ? dashboardRes.data : null,
    analytics: analyticsRes.ok ? analyticsRes.data : null,
    sections: sectionsRes.ok ? sectionsRes.data : [],
    error: !dashboardRes.ok && !analyticsRes.ok ? "unavailable" : undefined,
  };
}
