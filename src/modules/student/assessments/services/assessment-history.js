import { API_BASE_URL } from "./api-config.js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { mockAssessmentHistory, normalizeAttemptHistory } from "../utils/format.js";

const REQUEST_TIMEOUT_MS = 10_000;

export const ASSESSMENTS_STATE = Object.freeze({
  READY: "ready",
  NO_PROFILE: "no_profile",
  ERROR: "error",
});

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

export async function readOwnAssessmentHistory() {
  if (process.env.NEXT_PUBLIC_USE_MOCK === "true") {
    return mockAssessmentHistory();
  }

  const base = API_BASE_URL;
  const token = await accessToken();
  if (!base || !token) return { state: ASSESSMENTS_STATE.ERROR };

  let response;
  try {
    response = await fetch(`${base}/assessment-attempts/me?page_size=20`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { state: ASSESSMENTS_STATE.ERROR };
  }

  if (response.status === 403 || response.status === 404) {
    return { state: ASSESSMENTS_STATE.NO_PROFILE };
  }
  if (!response.ok) return { state: ASSESSMENTS_STATE.ERROR };

  try {
    const payload = await response.json();
    return {
      state: ASSESSMENTS_STATE.READY,
      attempts: normalizeAttemptHistory(payload?.data),
      meta: payload?.meta ?? null,
    };
  } catch {
    return { state: ASSESSMENTS_STATE.ERROR };
  }
}
