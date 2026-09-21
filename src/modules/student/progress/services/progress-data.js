/**
 * Server-side data fetcher for the Student Progress workspace.
 *
 * Runs exclusively on the server, forwarding the learner's Supabase
 * session token to the backend REST endpoints.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { PROGRESS_STATE, readProgressFromApi } from "./progress-transport.js";
import { apiBaseUrlFrom, trimmedBaseUrl } from "../../../../lib/api/base-url.js";

export { PROGRESS_STATE };

function apiBaseUrl() {
  return apiBaseUrlFrom(process.env.NEXT_PUBLIC_API_BASE_URL, trimmedBaseUrl);
}

async function accessToken() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();
    return error ? null : (data?.session?.access_token ?? null);
  } catch {
    return null;
  }
}

/**
 * Reads and compiles all progress data for the currently authenticated learner.
 */
export async function readProgress() {
  const base = apiBaseUrl();
  if (!base) return { state: PROGRESS_STATE.ERROR, reason: "unconfigured" };

  const token = await accessToken();
  return readProgressFromApi({ base, token });
}
