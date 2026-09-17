/**
 * Pure payload builders and normalizers for the advisory AI calls.
 *
 * Kept free of the browser/supabase imports so the exact request shapes and the
 * response normalisation can be unit-tested on Node's own runner. The service in
 * `services/ai-assistance.js` is the only place that performs the fetch.
 */

const MAX_TEXT = 2000;
const MAX_MASTERY_BAND_LENGTH = 40;

/**
 * Build a request payload matching `AnswerExplanationRequest` exactly.
 * The `extra="forbid"` contract is enforced server-side; only known keys are sent.
 */
export function buildExplanationPayload({
  questionText = "",
  submittedAnswer = null,
  isCorrect = false,
  competencyId = null,
} = {}) {
  const payload = {};

  if (typeof questionText === "string") {
    payload.question_text = questionText.trim().slice(0, MAX_TEXT);
  }

  payload.submitted_answer = submittedAnswer;
  payload.is_correct = isCorrect;

  if (competencyId && typeof competencyId === "string") {
    payload.competency_id = competencyId;
  }

  return payload;
}

/**
 * Build a request payload matching `StudentFeedbackRequest` exactly.
 */
export function buildFeedbackPayload({
  competencyId = null,
  score = null,
  masteryBand = null,
  displayContext = null,
} = {}) {
  const payload = {};

  if (competencyId && typeof competencyId === "string") {
    payload.competency_id = competencyId;
  }

  if (typeof score === "number" && Number.isFinite(score)) {
    payload.score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));
  }

  if (masteryBand && typeof masteryBand === "string") {
    payload.mastery_band = masteryBand.trim().slice(0, MAX_MASTERY_BAND_LENGTH);
  }

  if (displayContext && typeof displayContext === "string") {
    payload.display_context = displayContext.trim().slice(0, MAX_TEXT);
  }

  return payload;
}

/**
 * Map a raw advisory response to a UI-safe shape, or `null` when the response
 * was missing or malformed.
 */
export function normalizeAdvisory(raw) {
  if (!raw || typeof raw !== "object") return null;

  const text =
    typeof raw.explanation === "string"
      ? raw.explanation
      : typeof raw.feedback_text === "string"
        ? raw.feedback_text
        : null;

  if (!text || !text.trim()) return null;

  return {
    text: text.trim(),
    provider: typeof raw.provider === "string" ? raw.provider : null,
    model: typeof raw.model === "string" ? raw.model : null,
    generatedAt: typeof raw.generated_at === "string" ? raw.generated_at : null,
    confidenceScore:
      typeof raw.confidence_score === "number" ? raw.confidence_score : null,
  };
}