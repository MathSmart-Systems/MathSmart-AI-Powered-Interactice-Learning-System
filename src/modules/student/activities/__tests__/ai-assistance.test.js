/**
 * Unit tests for the advisory AI payload builders and normaliser.
 *
 * These are the pure hearts of the AI assistance service: the exact request
 * shapes must match the backend schemas (which forbid extra fields), and the
 * responser normalisation must turn any failure into `null` rather than
 * something the player could mistake for a grade.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildExplanationPayload,
  buildFeedbackPayload,
  normalizeAdvisory,
} from "../utils/ai-payloads.js";

describe("buildExplanationPayload", () => {
  it("sends only the AnswerExplanationRequest keys", () => {
    const payload = buildExplanationPayload({
      questionText: "  What is 4 × -3? ",
      submittedAnswer: "-12",
      isCorrect: false,
      competencyId: "comp-1",
    });

    assert.deepEqual(payload, {
      question_text: "What is 4 × -3?",
      submitted_answer: "-12",
      is_correct: false,
      competency_id: "comp-1",
    });
  });

  it("trims and bounds the question text", () => {
    const long = "a".repeat(3000);
    const payload = buildExplanationPayload({ questionText: long });
    assert.equal(payload.question_text.length, 2000);
  });
});

describe("buildFeedbackPayload", () => {
  it("builds a StudentFeedbackRequest-shaped payload", () => {
    const payload = buildFeedbackPayload({
      competencyId: "comp-1",
      score: 82.56,
      masteryBand: "Developing",
      displayContext: " Sign Rules. Integer operations. ",
    });

    assert.deepEqual(payload, {
      competency_id: "comp-1",
      score: 82.6,
      mastery_band: "Developing",
      display_context: "Sign Rules. Integer operations.",
    });
  });

  it("clamps score to 0–100 and bounds long strings", () => {
    assert.equal(buildFeedbackPayload({ score: 140 }).score, 100);
    assert.equal(buildFeedbackPayload({ score: -5 }).score, 0);
    assert.equal(buildFeedbackPayload({ masteryBand: "x".repeat(90) }).mastery_band.length, 40);
    assert.equal(buildFeedbackPayload({ displayContext: "y".repeat(3000) }).display_context.length, 2000);
  });

  it("omits absent fields rather than sending nulls", () => {
    assert.deepEqual(buildFeedbackPayload({}), {});
  });
});

describe("normalizeAdvisory", () => {
  it("keeps the explanation path and provenance", () => {
    const result = normalizeAdvisory({
      explanation: "Try thinking of the sign rule.",
      provider: "groq",
      model: "mock-groq-model",
      generated_at: "2026-09-17T01:00:00Z",
      confidence_score: 0.9,
    });

    assert.deepEqual(result, {
      text: "Try thinking of the sign rule.",
      provider: "groq",
      model: "mock-groq-model",
      generatedAt: "2026-09-17T01:00:00Z",
      confidenceScore: 0.9,
    });
  });

  it("also reads the student-feedback shape", () => {
    const result = normalizeAdvisory({ feedback_text: "You're improving!" });
    assert.equal(result.text, "You're improving!");
    assert.equal(result.model, null);
  });

  it("resolves to null for empty or malformed responses", () => {
    assert.equal(normalizeAdvisory(null), null);
    assert.equal(normalizeAdvisory({}), null);
    assert.equal(normalizeAdvisory({ explanation: "  " }), null);
    assert.equal(normalizeAdvisory("text"), null);
  });
});