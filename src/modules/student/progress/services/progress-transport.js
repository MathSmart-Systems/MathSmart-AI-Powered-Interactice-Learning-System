import { buildProgressModel } from "../utils/progress-model.js";

const REQUEST_TIMEOUT_MS = 10_000;

export const PROGRESS_STATE = Object.freeze({
  READY: "ready",
  NO_PROFILE: "no_profile",
  ERROR: "error",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readFromApi(path, token, base, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(`${base}${path}`, {
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
    return isRecord(body) && Object.hasOwn(body, "data")
      ? { ok: true, data: body.data }
      : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: response.status };
  }
}

function isMissingProfile(result) {
  return result.status === 404 || result.status === 403;
}

function isProgress(value) {
  return isRecord(value) &&
    Array.isArray(value.competencies) &&
    Array.isArray(value.recent_activity) &&
    (value.overall_mastery === null || typeof value.overall_mastery === "number") &&
    (value.diagnostic_score === null || typeof value.diagnostic_score === "number") &&
    (value.growth === null || typeof value.growth === "number");
}

/** Reads authenticated `/me` contracts and rejects mixed-learner payloads. */
export async function readProgressFromApi({ base, token, fetchImpl = fetch }) {
  if (!base) return { state: PROGRESS_STATE.ERROR, reason: "unconfigured" };
  if (!token) return { state: PROGRESS_STATE.ERROR, reason: "session" };

  const [learner, progress, pathItems] = await Promise.all([
    readFromApi("/students/me", token, base, fetchImpl),
    readFromApi("/progress/me", token, base, fetchImpl),
    readFromApi("/learning-path/me", token, base, fetchImpl),
  ]);

  if (isMissingProfile(learner) || isMissingProfile(progress)) {
    return { state: PROGRESS_STATE.NO_PROFILE };
  }
  if (!learner.ok || !progress.ok) {
    return { state: PROGRESS_STATE.ERROR, reason: "unavailable" };
  }
  if (!isRecord(learner.data) || !isProgress(progress.data)) {
    return { state: PROGRESS_STATE.ERROR, reason: "malformed" };
  }

  const learnerId = learner.data.student_id;
  if (
    typeof learnerId !== "string" ||
    learnerId.length === 0 ||
    learnerId !== progress.data.student_id
  ) {
    return { state: PROGRESS_STATE.ERROR, reason: "association" };
  }

  try {
    return {
      state: PROGRESS_STATE.READY,
      model: buildProgressModel({
        learner: learner.data,
        progress: progress.data,
        pathItems: Array.isArray(pathItems.data) ? pathItems.data : [],
      }),
      pathUnavailable: !pathItems.ok || !Array.isArray(pathItems.data),
    };
  } catch {
    return { state: PROGRESS_STATE.ERROR, reason: "malformed" };
  }
}
