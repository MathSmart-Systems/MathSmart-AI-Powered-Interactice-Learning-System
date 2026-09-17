/**
 * Advisory AI helpers for the Student Activities module.
 *
 * Two bounded advisory calls are made from the activity player:
 *
 *  1. `explainIncorrectAnswer` – called only after the deterministic
 *     answer-check already returned `is_correct: false`.  The response has no
 *     `is_correct` and no score, so it cannot change either.
 *
 *  2. `encourageStudent` – called only after the deterministic submit already
 *     returned the score, mastery band, and pass decision.  The response is a
 *     friendly summary for the completion screen.
 *
 * Both are advisory.  Groq-disabled, timeout, rate-limit, malformed-response
 * and dependency-failure paths all fall back to `null`.  The player never waits
 * on either request before showing the deterministic result.
 *
 * Requests carry no credential.  The response is labelled as advisory in the UI
 * and displayed with provider/model/time provenance.
 */

import { getApiUrl } from "./api-config.js";
import { createClient } from "@/lib/supabase/client";

import {
  buildExplanationPayload,
  buildFeedbackPayload,
  normalizeAdvisory,
} from "../utils/ai-payloads.js";

const REQUEST_TIMEOUT_MS = 10_000;

async function getAccessToken() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  return error ? null : (data?.session?.access_token ?? null);
}

/**
 * One advisory POST against the AI module.
 *
 * Returns the parsed `data` payload on success, or `null` on any failure
 * without throwing into the player.
 */
async function advisoryRequest(path, body) {
  let apiUrl;
  try {
    apiUrl = getApiUrl(path);
  } catch {
    return null;
  }

  const token = await getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    return payload?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Advisory explanation of a completed incorrect answer check.
 *
 * @returns {Promise<{text: string, provider: string|null, model: string|null, generatedAt: string|null, confidenceScore: number|null}|null>}
 */
export async function explainIncorrectAnswer({
  questionText = "",
  submittedAnswer = null,
  competencyId = null,
} = {}) {
  const body = buildExplanationPayload({
    questionText,
    submittedAnswer,
    isCorrect: false,
    competencyId,
  });

  const raw = await advisoryRequest("/ai/incorrect-answer-explanation", body);
  return normalizeAdvisory(raw);
}

/**
 * Advisory encouragement after a scored activity attempt.
 *
 * @returns {Promise<{text: string, provider: string|null, model: string|null, generatedAt: string|null, confidenceScore: number|null}|null>}
 */
export async function encourageStudent({
  competencyId = null,
  score = null,
  masteryBand = null,
  displayContext = null,
} = {}) {
  const body = buildFeedbackPayload({
    competencyId,
    score,
    masteryBand,
    displayContext,
  });

  const raw = await advisoryRequest("/ai/student-feedback", body);
  return normalizeAdvisory(raw);
}