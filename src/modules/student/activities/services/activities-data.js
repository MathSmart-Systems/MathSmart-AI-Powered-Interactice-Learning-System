/**
 * Server-side read for the student Activities catalogue.
 *
 * This module runs only on the server. It forwards the caller's own Supabase
 * access token to the MathSmart API and asks for the published activity
 * catalogue; the API scopes each activity's attempt count, best score and
 * learning-path status to the caller's own learner record via Row Level
 * Security, so a learner can only ever read their own standing. No learner
 * identifier is sent and nothing here decides a score.
 *
 * Path statuses use the same `app.path_item_status` vocabulary as the rest of
 * the student workspace: locked, available, in_progress, completed.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { API_BASE_URL } from "./api-config.js";
import { buildActivityList } from "../utils/activities-model.js";

const REQUEST_TIMEOUT_MS = 10_000;

export const ACTIVITIES_STATE = Object.freeze({
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

/**
 * Reads the published activity catalogue for the signed-in learner.
 *
 * @returns {Promise<{state: string, items?: object[], meta?: object|null}>}
 */
export async function readActivityList() {
  if (!API_BASE_URL) return { state: ACTIVITIES_STATE.ERROR };

  const token = await accessToken();
  if (!token) return { state: ACTIVITIES_STATE.ERROR };

  let response;
  try {
    response = await fetch(
      `${API_BASE_URL}/activities?status=published&page_size=100`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
  } catch {
    return { state: ACTIVITIES_STATE.ERROR };
  }

  if (response.status === 403 || response.status === 404) {
    return { state: ACTIVITIES_STATE.NO_PROFILE };
  }
  if (!response.ok) return { state: ACTIVITIES_STATE.ERROR };

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { state: ACTIVITIES_STATE.ERROR };
  }

  return {
    state: ACTIVITIES_STATE.READY,
    items: buildActivityList(Array.isArray(payload?.data) ? payload.data : []),
    meta: payload?.meta ?? null,
  };
}