/**
 * Server-side reads for Student My Learning.
 *
 * This module runs only on the server. It forwards the caller's own Supabase
 * access token to the MathSmart API and asks for the learner, the module
 * catalogue and the learning path; it never queries a reporting table, never
 * touches a secret key, and never decides a learner result of its own. The API
 * verifies the token and Row Level Security decides how much of the answer may
 * come back, so a learner can only ever read content that is published and
 * progress that is their own.
 */

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { buildMyLearningModel, buildModuleReaderModel } from "../utils/my-learning-model";

const REQUEST_TIMEOUT_MS = 10_000;

/** Every outcome the My Learning screens know how to render. */
export const MY_LEARNING_STATE = Object.freeze({
  READY: "ready",
  NO_PROFILE: "no_profile",
  ERROR: "error",
});

function apiBaseUrl(base = process.env.NEXT_PUBLIC_API_BASE_URL) {
  if (typeof base !== "string" || !base) {
    return null;
  }
  const trimmed = base.replace(/\/+$/, "");
  const isLoopback =
    /^http:\/\/127\.0\.0\.1(?::\d+)?($|\/)/i.test(trimmed) ||
    /^http:\/\/localhost(?::\d+)?($|\/)/i.test(trimmed);
  return /^https:/i.test(trimmed) || isLoopback ? trimmed : null;
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
 * One authenticated GET against the MathSmart API.
 *
 * @returns {Promise<{ok: true, data: unknown, meta: unknown} | {ok: false, status: number|null}>}
 */
async function readFromApi(path, token, base) {
  let response;

  try {
    response = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Timed out, refused, or DNS failed: the service is unreachable, which is
    // not the same thing as the lesson being missing.
    return { ok: false, status: null };
  }

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  try {
    const body = await response.json();
    return { ok: true, data: body?.data ?? null, meta: body?.meta ?? null };
  } catch {
    return { ok: false, status: response.status };
  }
}

/**
 * A learner whose account exists but whose learner record does not, or whose
 * route is refused for them. The API answers 404/403 the same way it does for
 * the dashboard, so the screen can point the learner at their teacher.
 */
function isMissingProfile(result) {
  return result.status === 404 || result.status === 403;
}

/**
 * Reads the signed-in learner's My Learning list.
 *
 * @returns {Promise<{state: string, model?: object, reason?: string, pathUnavailable?: boolean}>}
 */
export async function readMyLearning() {
  const base = apiBaseUrl();

  if (!base) {
    return { state: MY_LEARNING_STATE.ERROR, reason: "unconfigured" };
  }

  const token = await accessToken();

  if (!token) {
    return { state: MY_LEARNING_STATE.ERROR, reason: "session" };
  }

  const [learner, firstCataloguePage, pathData] = await Promise.all([
    readFromApi("/students/me", token, base),
    readFromApi("/modules?page_size=100", token, base),
    readFromApi("/learning-path/me", token, base),
  ]);

  if (isMissingProfile(learner)) {
    return { state: MY_LEARNING_STATE.NO_PROFILE };
  }

  // The learner record and the catalogue are what the page is about. The
  // learning path is a supporting list, so an unavailable path degrades to an
  // empty one rather than replacing the whole screen with a failure.
  if (!learner.ok || !firstCataloguePage.ok) {
    return { state: MY_LEARNING_STATE.ERROR, reason: "unavailable" };
  }

  const totalPages = Math.max(
    1,
    Math.trunc(Number(firstCataloguePage.meta?.total_pages) || 1),
  );
  const remainingCataloguePages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      readFromApi(`/modules?page=${index + 2}&page_size=100`, token, base),
    ),
  );

  if (remainingCataloguePages.some((page) => !page.ok)) {
    return { state: MY_LEARNING_STATE.ERROR, reason: "unavailable" };
  }

  const modules = [firstCataloguePage, ...remainingCataloguePages].flatMap((page) =>
    Array.isArray(page.data) ? page.data : [],
  );

  return {
    state: MY_LEARNING_STATE.READY,
    model: buildMyLearningModel({
      modules,
      pathItems: pathData.ok && Array.isArray(pathData.data) ? pathData.data : [],
    }),
    diagnosticStatus: learner.data?.diagnostic_status ?? null,
    pathUnavailable: !pathData.ok,
  };
}

/** Every outcome the module reader can render. */
export const MODULE_STATE = Object.freeze({
  READY: "ready",
  NOT_FOUND: "not_found",
  ERROR: "error",
});

/**
 * Reads one module for the signed-in learner.
 *
 * @returns {Promise<{state: string, model?: object, reason?: string}>}
 */
export async function readModule(moduleId) {
  const base = apiBaseUrl();

  if (!base) {
    return { state: MODULE_STATE.ERROR, reason: "unconfigured" };
  }

  const token = await accessToken();

  if (!token) {
    return { state: MODULE_STATE.ERROR, reason: "session" };
  }

  const result = await readFromApi(`/modules/${moduleId}`, token, base);

  if (result.status === 404 || result.status === 403) {
    return { state: MODULE_STATE.NOT_FOUND };
  }

  if (!result.ok) {
    return { state: MODULE_STATE.ERROR, reason: "unavailable" };
  }

  return {
    state: MODULE_STATE.READY,
    model: buildModuleReaderModel(result.data),
  };
}
