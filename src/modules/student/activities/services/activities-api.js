/**
 * Client-side Activity player API.
 *
 * Speaks the canonical MathSmart REST contract in `docs/API_ROUTES.md` section
 * "Student Activities". Every deterministic output — correctness, verdicts,
 * scores, pass decisions, competency aggregates, interventions — is decided by
 * the database through the API. Nothing here grades; the browser only sends
 * answers and reads back results.
 *
 * No student identifier is ever sent from the browser. The backend derives the
 * caller from the verified `sub` claim on the access token, so ownership is a
 * server-side decision.
 */

import { getApiUrl } from "./api-config.js";
import { createClient } from "@/lib/supabase/client";

import { toQuestionView, toAttemptView, toOutcomeView } from "../utils/activities-model.js";

/** Error carrying a message that is safe to show a learner. */
export class ActivityError extends Error {
  constructor(message, { status = null, code = null } = {}) {
    super(message);
    this.name = "ActivityError";
    this.status = status;
    this.code = code;
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

function fallbackMessage(status) {
  switch (status) {
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You do not have access to this activity.";
    case 404:
      return "This activity is not ready yet. Ask your teacher if you expected it to be.";
    case 422:
      return "Some of your answers could not be accepted. Please review and try again.";
    default:
      return "Something went wrong while loading your activity. Please try again.";
  }
}

async function accessToken() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data?.session?.access_token) {
    throw new ActivityError("Your session has expired. Please sign in again.", {
      status: 401,
    });
  }

  return data.session.access_token;
}

async function request(path, { method = "GET", body } = {}) {
  let apiUrl;

  try {
    apiUrl = getApiUrl(path);
  } catch {
    throw new ActivityError(
      "MathSmart is not configured for this environment. Please tell your teacher.",
      { code: "api_not_configured" },
    );
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${await accessToken()}`,
  };

  let response;

  try {
    response = await fetch(apiUrl, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ActivityError(
      "We could not reach MathSmart. Check your connection and try again.",
    );
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ActivityError(
      payload?.error?.message || fallbackMessage(response.status),
      { status: response.status, code: payload?.error?.code ?? null },
    );
  }

  return payload?.data ?? null;
}

/** One published activity with its ordered questions, without answer keys. */
export async function loadActivityDetail(activityId) {
  if (!activityId) {
    throw new ActivityError("This activity could not be opened.", { status: 404 });
  }

  const detail = await request(`/activities/${activityId}`);
  return toQuestionView(detail);
}

/** Start an activity attempt, or resume the one already open. */
export async function startAttempt(activityId) {
  const attempt = await request(`/activities/${activityId}/attempts`, {
    method: "POST",
  });
  return toAttemptView(attempt);
}

/** Immediate deterministic feedback on one answer. */
export async function checkAnswer({ attemptId, questionId, answer }) {
  if (!attemptId) {
    throw new ActivityError("This activity is no longer active. Reload the page.");
  }

  return request(`/activity-attempts/${attemptId}/answer-checks`, {
    method: "POST",
    body: { question_id: questionId, answer },
  });
}

/** The authored hint for one question. It never discloses the answer. */
export async function requestHint({ attemptId, questionId }) {
  if (!attemptId) {
    throw new ActivityError("This activity is no longer active. Reload the page.");
  }

  const result = await request(`/activity-attempts/${attemptId}/hints`, {
    method: "POST",
    body: { question_id: questionId },
  });

  return result?.hint ?? null;
}

/**
 * Finalise the activity. Scoring, the pass decision and any competency or
 * intervention updates all happen server-side; nothing here grades anything.
 */
export async function submitActivity({ attemptId, answers, timeSpentSeconds }) {
  if (!attemptId) {
    throw new ActivityError(
      "This activity is no longer active. Reload the page and start again.",
    );
  }

  const outcome = await request(`/activity-attempts/${attemptId}/submit`, {
    method: "POST",
    body: {
      answers: answers.map(({ questionId, answer }) => ({
        question_id: questionId,
        answer,
      })),
      time_spent_seconds: timeSpentSeconds,
    },
  });

  return toOutcomeView(outcome);
}