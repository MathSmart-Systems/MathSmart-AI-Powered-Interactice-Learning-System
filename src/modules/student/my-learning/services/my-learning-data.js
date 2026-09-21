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

import {
  buildMyLearningModel,
  buildModuleReaderModel,
  isLockedModule,
} from "../utils/my-learning-model";
import { readCataloguePages } from "./catalogue-pagination";
import { sameOriginApiBaseUrl } from "../../../../lib/api/base-url.js";

const REQUEST_TIMEOUT_MS = 10_000;

/** Every outcome the My Learning screens know how to render. */
export const MY_LEARNING_STATE = Object.freeze({
  READY: "ready",
  NO_PROFILE: "no_profile",
  ERROR: "error",
});

function apiBaseUrl(base = process.env.NEXT_PUBLIC_API_BASE_URL) {
  if (typeof base !== "string" || !base.trim()) {
    return sameOriginApiBaseUrl();
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
 * @returns {Promise<{ok: true, data: unknown, meta: unknown} | {ok: false, status: number|null, code: string|null}>}
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
    return { ok: false, status: null, code: null };
  }

  if (!response.ok) {
    // The envelope names the refusal (`content_locked`, `not_found`, …) and the
    // status alone does not: 412 covers both a locked lesson and one whose
    // sections are merely unfinished. Reading the code here is what lets the
    // caller choose a state instead of a generic failure. A body that will not
    // parse is still a refusal, so the status is reported either way.
    let code = null;
    try {
      const body = await response.json();
      code = body?.error?.code ?? null;
    } catch {
      code = null;
    }
    return { ok: false, status: response.status, code };
  }

  try {
    const body = await response.json();
    return { ok: true, data: body?.data ?? null, meta: body?.meta ?? null };
  } catch {
    return { ok: false, status: response.status, code: null };
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

  const catalogue = await readCataloguePages(
    firstCataloguePage,
    (page) => readFromApi(`/modules?page=${page}&page_size=100`, token, base),
  );

  if (!catalogue.ok) {
    return { state: MY_LEARNING_STATE.ERROR, reason: "unavailable" };
  }

  const modules = catalogue.pages.flatMap((page) =>
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
  LOCKED: "locked",
  ERROR: "error",
});

/**
 * The API's code for content the learner's path has not opened yet.
 *
 * It is the same string `backend/modules/learning_modules/router.py` sends as
 * `LOCKED_CODE`. The status alone cannot stand in for it: 412 also carries
 * `sections_incomplete`, which is not a refusal but an instruction to read on.
 */
const LOCKED_CODE = "content_locked";

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

  if (result.status === 412 && result.code === LOCKED_CODE) {
    return { state: MODULE_STATE.LOCKED, reason: LOCKED_CODE };
  }

  if (!result.ok) {
    return { state: MODULE_STATE.ERROR, reason: "unavailable" };
  }

  // A locked lesson can also arrive as an ordinary 200: reading one is not
  // forbidden, it is recording progress against it that the database refuses.
  // Handing that lesson to the reader would give a learner a checklist whose
  // every tick comes back as an error, so it stops here as well.
  const model = buildModuleReaderModel(result.data);

  if (isLockedModule(model)) {
    return { state: MODULE_STATE.LOCKED, reason: LOCKED_CODE };
  }

  return {
    state: MODULE_STATE.READY,
    model,
  };
}
