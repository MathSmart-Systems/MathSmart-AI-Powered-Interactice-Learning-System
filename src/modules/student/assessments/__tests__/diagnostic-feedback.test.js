import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAssessmentFeedbackContext,
  buildFeedbackPayload,
  fallbackMessage,
  getMockFeedback,
} from "../services/diagnostic-feedback.js";

describe("diagnostic fallbackMessage", () => {
  it("provides a student-friendly explanation for 503 AI/service outages", () => {
    const msg = fallbackMessage(503);
    assert.match(msg, /AI assistance is currently unavailable/i);
    assert.match(msg, /scores and results are unaffected/i);
  });

  it("handles standard HTTP failure statuses", () => {
    assert.match(fallbackMessage(401), /session has expired/i);
    assert.match(fallbackMessage(403), /do not have access/i);
    assert.match(fallbackMessage(404), /not available yet/i);
    assert.match(fallbackMessage(409), /already been submitted/i);
    assert.match(fallbackMessage(412), /not eligible/i);
    assert.match(fallbackMessage(422), /could not be accepted/i);
  });

  it("falls back to generic error message for unknown status codes", () => {
    assert.match(fallbackMessage(500), /something went wrong/i);
    assert.match(fallbackMessage(null), /something went wrong/i);
  });
});

describe("buildFeedbackPayload", () => {
  it("constructs payload strictly matching backend StudentFeedbackRequest", () => {
    const payload = buildFeedbackPayload({
      competencyId: "550e8400-e29b-41d4-a716-446655440000",
      score: 75.5,
      masteryBand: "Developing",
      displayContext: "Completed diagnostic assessment",
    });

    assert.deepEqual(payload, {
      competency_id: "550e8400-e29b-41d4-a716-446655440000",
      score: 75.5,
      mastery_band: "Developing",
      display_context: "Completed diagnostic assessment",
    });
  });

  it("clamps score within 0 to 100", () => {
    const over = buildFeedbackPayload({ score: 150 });
    assert.equal(over.score, 100);

    const under = buildFeedbackPayload({ score: -20 });
    assert.equal(under.score, 0);
  });

  it("omits unset and invalid fields so extra='forbid' is not triggered", () => {
    const empty = buildFeedbackPayload({});
    assert.deepEqual(empty, {});

    const nulls = buildFeedbackPayload({
      competencyId: null,
      score: NaN,
      masteryBand: null,
      displayContext: null,
    });
    assert.deepEqual(nulls, {});
  });

  it("truncates mastery_band and display_context to schema bounds", () => {
    const longBand = "a".repeat(50);
    const longContext = "b".repeat(2500);

    const payload = buildFeedbackPayload({
      masteryBand: longBand,
      displayContext: longContext,
    });

    assert.equal(payload.mastery_band.length, 40);
    assert.equal(payload.display_context.length, 2000);
  });
});

describe("getMockFeedback", () => {
  it("returns mock feedback structure with advisory provenance", () => {
    const feedback = getMockFeedback({ score: 85 });

    assert.ok(feedback, "Feedback result should not be null");
    assert.equal(typeof feedback.feedback_text, "string");
    assert.ok(feedback.feedback_text.length > 0);
    assert.equal(feedback.provider, "groq");
    assert.equal(feedback.confidence_score, null);
    assert.ok(feedback.generated_at);
  });

  it("tailors mock feedback tone according to score band", () => {
    const high = getMockFeedback({ score: 90 });
    assert.match(high.feedback_text, /outstanding/i);

    const mid = getMockFeedback({ score: 65 });
    assert.match(mid.feedback_text, /good effort/i);

    const developing = getMockFeedback({ score: 40 });
    assert.match(developing.feedback_text, /starting point/i);
  });

  it("handles missing input safely without throwing", () => {
    const feedback = getMockFeedback();
    assert.ok(feedback);
    assert.equal(typeof feedback.feedback_text, "string");
  });
});

describe("buildAssessmentFeedbackContext", () => {
  it("constructs context capturing assessment title, score, and difference between competencies", () => {
    const ctx = buildAssessmentFeedbackContext({
      assessmentTitle: "Grade 6 Diagnostic 47EC5A",
      percentage: 75,
      totalScore: 6,
      maxScore: 8,
      domainScores: [
        {
          domain: "Fractions",
          score: 4,
          maxScore: 4,
          percentage: 100,
          mastery_band: "Mastered",
        },
        {
          domain: "Decimals",
          score: 2,
          maxScore: 4,
          percentage: 50,
          mastery_band: "Developing",
        },
      ],
    });

    assert.match(ctx, /Assessment: "Grade 6 Diagnostic"/);
    assert.match(ctx, /Overall result: 75% \(6\/8 points\)/);
    assert.match(ctx, /Mastered areas: Fractions \(4\/4, 100%\)/);
    assert.match(ctx, /Developing areas: Decimals \(2\/4, 50%\)/);
    assert.match(ctx, /Performance difference:/);
  });

  it("incorporates focused competency when student focuses on a specific strand", () => {
    const ctx = buildAssessmentFeedbackContext({
      assessmentTitle: "Math Assessment",
      percentage: 60,
      focusedCompetency: "Algebra Basics",
      domainScores: [
        { domain: "Algebra Basics", percentage: 50, mastery_band: "Developing" },
      ],
    });

    assert.match(ctx, /The student is currently focusing on: "Algebra Basics"/);
  });

  it("sanitizes raw test IDs and hashes from labels", () => {
    const ctx = buildAssessmentFeedbackContext({
      assessmentTitle: "Diagnostic (ID 47EC5A)",
      domainScores: [
        {
          domain: "Acceptance competency (ID 47EC5A)",
          percentage: 50,
          mastery_band: "Developing",
        },
      ],
    });

    assert.doesNotMatch(ctx, /47EC5A/);
    assert.doesNotMatch(ctx, /\(ID/);
  });

  it("handles empty parameters safely", () => {
    const ctx = buildAssessmentFeedbackContext();
    assert.ok(typeof ctx === "string");
    assert.ok(ctx.length > 0);
  });
});

