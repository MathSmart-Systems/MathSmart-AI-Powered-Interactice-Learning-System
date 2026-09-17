/**
 * Server-side data fetcher for the Student Progress workspace.
 *
 * Runs exclusively on the server, forwarding the learner's Supabase
 * session token to the backend REST endpoints.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { buildProgressModel } from "../utils/progress-model.js";

const REQUEST_TIMEOUT_MS = 10_000;

export const PROGRESS_STATE = Object.freeze({
  READY: "ready",
  NO_PROFILE: "no_profile",
  ERROR: "error",
});

function apiBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  return typeof base === "string" && base ? base.replace(/\/+$/, "") : null;
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

function isMissingProfile(result) {
  return result.status === 404 || result.status === 403;
}

/**
 * Reads and compiles all progress data for the currently authenticated learner.
 */
export async function readProgress() {
  const base = apiBaseUrl();

  if (!base) {
    return { state: PROGRESS_STATE.ERROR, reason: "unconfigured" };
  }

  const token = await accessToken();

  if (!token) {
    return { state: PROGRESS_STATE.ERROR, reason: "session" };
  }

  const [learner, progress, pathItems] = await Promise.all([
    readFromApi("/students/me", token, base),
    readFromApi("/progress/me", token, base),
    readFromApi("/learning-path/me", token, base),
  ]);

  if (isMissingProfile(learner) || isMissingProfile(progress)) {
    return { state: PROGRESS_STATE.NO_PROFILE };
  }

  if (!learner.ok || !progress.ok) {
    return { state: PROGRESS_STATE.ERROR, reason: "unavailable" };
  }

  const model = buildProgressModel({
    learner: learner.data,
    progress: progress.data,
    pathItems: pathItems.ok ? pathItems.data : [],
  });

  return {
    state: PROGRESS_STATE.READY,
    model,
    pathUnavailable: !pathItems.ok,
  };
}
