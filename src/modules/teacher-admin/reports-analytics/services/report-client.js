/**
 * Browser calls from the Reports page: the CSV export and the optional summary.
 *
 * Both run with the teacher's own session. Neither can change a figure: the
 * export is the server's rows for the chosen section and status, and the
 * summary request carries only the filters — the server reads the numbers
 * itself, so there is nothing here that could hand Groq a figure the
 * database never produced.
 */

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { summaryBody } from "../utils/report-filters.js";
import { apiBaseUrlFrom, trimmedBaseUrl } from "../../../../lib/api/base-url.js";

const EXPORT_TIMEOUT_MS = 30_000;
const SUMMARY_TIMEOUT_MS = 20_000;

function apiBaseUrl() {
  return apiBaseUrlFrom(process.env.NEXT_PUBLIC_API_BASE_URL, trimmedBaseUrl);
}

async function accessToken() {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    return error ? null : (data?.session?.access_token ?? null);
  } catch {
    return null;
  }
}

async function errorCode(response) {
  try {
    const body = await response.json();
    return body?.error?.code ?? null;
  } catch {
    return null;
  }
}

/** The filename the server chose, from Content-Disposition. */
export function exportFilename(header) {
  const match = /filename="?([^";]+)"?/i.exec(header ?? "");
  return match ? match[1] : "mathsmart-progress.csv";
}

/**
 * Downloads the progress CSV for the report's section and status.
 *
 * @param {{sectionId?: string|null, status?: string|null}} filters
 * @returns {Promise<{ok: true, filename: string} | {ok: false, message: string}>}
 */
export async function downloadProgressCsv(filters) {
  const base = apiBaseUrl();
  if (!base) return { ok: false, message: "Exports are not set up for this deployment." };
  const token = await accessToken();
  if (!token) return { ok: false, message: "Your session has ended. Sign in again to export." };

  const params = new URLSearchParams();
  if (filters.sectionId) params.set("section_id", filters.sectionId);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();

  let response;
  try {
    response = await fetch(`${base}/teacher-admin/reports/progress.csv${query ? `?${query}` : ""}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" },
      cache: "no-store",
      signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, message: "The export could not reach MathSmart. Try again." };
  }

  if (!response.ok) {
    if (response.status === 401 || (await errorCode(response)) === "session_expired") {
      return { ok: false, message: "Sign in again to export. Exports need a recent sign-in." };
    }
    return { ok: false, message: "The export could not be prepared. Try again." };
  }

  const filename = exportFilename(response.headers.get("Content-Disposition"));
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, filename };
}

/**
 * Asks for the optional AI summary of the report with these filters.
 *
 * @returns {Promise<{ok: boolean, status: number|null, data?: object, code?: string|null}>}
 */
export async function requestReportSummary(filters) {
  const base = apiBaseUrl();
  if (!base) return { ok: false, status: null, code: "unconfigured" };
  const token = await accessToken();
  if (!token) return { ok: false, status: null, code: "no_session" };

  let response;
  try {
    response = await fetch(`${base}/teacher-admin/reports/summary`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(summaryBody(filters)),
      cache: "no-store",
      signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: null, code: "unreachable" };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, code: await errorCode(response) };
  }
  try {
    const body = await response.json();
    return { ok: true, status: response.status, data: body?.data ?? null };
  } catch {
    return { ok: false, status: response.status, code: "unreadable" };
  }
}
