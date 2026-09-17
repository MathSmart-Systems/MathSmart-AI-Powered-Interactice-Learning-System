import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const REQUEST_TIMEOUT_MS = 30_000;

function apiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
}

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

async function apiRequest(method, path) {
  const base = apiBaseUrl();
  if (!base) return { ok: false, status: null, error: "API not configured" };

  const token = await getAccessToken();
  if (!token) return { ok: false, status: null, error: "Session not available" };

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const detail = cause?.cause?.message || cause?.message || cause?.name || "Network request failed";
    return { ok: false, status: null, error: `Service unavailable (${detail})` };
  }

  const status = response.status;
  if (status === 204) return { ok: true, status };

  let json;
  try {
    json = await response.json();
  } catch {
    return { ok: false, status, error: `Server error (${status})` };
  }

  if (!response.ok) {
    const message = json?.error?.message || json?.detail || `Request failed with status ${status}`;
    return { ok: false, status, error: message };
  }
  return { ok: true, status, data: json?.data ?? json, meta: json?.meta };
}

export async function fetchDashboard({ gradeId = null, sectionId = null } = {}) {
  const params = new URLSearchParams();
  if (gradeId) params.set("grade_id", gradeId);
  if (sectionId) params.set("section_id", sectionId);
  const qs = params.toString();
  return apiRequest("GET", `/teacher-admin/dashboard${qs ? `?${qs}` : ""}`);
}

export async function fetchAnalytics({ gradeId = null, sectionId = null } = {}) {
  const params = new URLSearchParams();
  if (gradeId) params.set("grade_id", gradeId);
  if (sectionId) params.set("section_id", sectionId);
  const qs = params.toString();
  return apiRequest("GET", `/teacher-admin/analytics${qs ? `?${qs}` : ""}`);
}

export async function fetchSections() {
  return apiRequest("GET", "/teacher-admin/classes");
}

export async function fetchCsvExportUrl({ gradeId = null, sectionId = null } = {}) {
  const base = apiBaseUrl();
  if (!base) return null;

  const token = await getAccessToken();
  if (!token) return null;

  const params = new URLSearchParams();
  if (gradeId) params.set("grade_id", gradeId);
  if (sectionId) params.set("section_id", sectionId);
  const qs = params.toString();

  const response = await fetch(`${base}/teacher-admin/reports/progress.csv${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) return null;

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
