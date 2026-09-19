/**
 * Unit tests for the advisory evidence and the reply reader.
 *
 * Two things matter most here and most of these are about them: that no
 * learner identity can reach the request, and that every way the call can fail
 * ends with the deterministic page intact and nothing invented.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInsightEvidence,
  insightUnavailableReason,
  readInsight,
  weakestCompetency,
} from "../utils/insight-evidence.js";

const competency = (overrides = {}) => ({
  competency_id: "c-1",
  competency_code: "MATH6-INT-02",
  competency_name: "Multiplication of Integers",
  diagnostic_score: 40,
  current_score: 55,
  mastery_band: "developing",
  attempt_count: 6,
  unsuccessful_attempts: 2,
  ...overrides,
});

const progress = (overrides = {}) => ({
  student_id: "58000000-0000-4000-8000-000000000001",
  competencies: [competency()],
  recent_activity: [{ title: "Integers on a number line", label: "activity", score: 70 }],
  ...overrides,
});

describe("weakestCompetency", () => {
  it("picks the competency with the lowest current score", () => {
    const weak = competency({ competency_id: "c-2", current_score: 20 });
    const found = weakestCompetency(progress({ competencies: [competency(), weak] }));

    assert.equal(found.competency_id, "c-2");
  });

  it("skips a competency with no score yet, which has nothing to explain", () => {
    const unscored = competency({ competency_id: "c-3", current_score: null });
    const found = weakestCompetency(progress({ competencies: [unscored, competency()] }));

    assert.equal(found.competency_id, "c-1");
  });

  it("reports nothing when no competency has been scored", () => {
    const unscored = competency({ current_score: null, diagnostic_score: null });
    assert.equal(weakestCompetency(progress({ competencies: [unscored] })), null);
  });

  it("survives a progress payload that failed to load", () => {
    assert.equal(weakestCompetency(null), null);
    assert.equal(weakestCompetency(undefined), null);
    assert.equal(weakestCompetency({}), null);
    assert.equal(weakestCompetency({ competencies: null }), null);
  });
});

describe("buildInsightEvidence", () => {
  it("carries only the fields the contract accepts", () => {
    const evidence = buildInsightEvidence(progress(), competency());

    assert.deepEqual(Object.keys(evidence).sort(), [
      "attemptCount",
      "competencyId",
      "completedModules",
      "currentScore",
      "diagnosticScore",
      "displayContext",
      "unsuccessfulAttempts",
    ]);
  });

  it("never carries a learner's identity", () => {
    const evidence = buildInsightEvidence(
      progress({ student_id: "58000000-0000-4000-8000-000000000001" }),
      competency(),
    );
    const serialised = JSON.stringify(evidence);

    assert.ok(!serialised.includes("58000000"), "the learner id travelled");
    assert.ok(!/full_name|email|learner_id/.test(serialised), "an identity field travelled");
  });

  it("does not put the learner in the free-text context", () => {
    const evidence = buildInsightEvidence(progress(), competency());

    assert.ok(!evidence.displayContext.includes("Juan"));
    assert.ok(evidence.displayContext.includes("MATH6-INT-02"));
  });

  it("sends no incorrect patterns, because that evidence is not collected", () => {
    // Recurring-mistake analysis is blocked: no per-question text with a wrong
    // verdict exists anywhere. Sending an empty array and calling it pattern
    // analysis would be worse than not asking.
    const evidence = buildInsightEvidence(progress(), competency());

    assert.equal("incorrectPatterns" in evidence, false);
  });

  it("caps completed modules at the contract's limit of twenty", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ title: `Module ${index}` }));
    const evidence = buildInsightEvidence(progress({ recent_activity: many }), competency());

    assert.equal(evidence.completedModules.length, 20);
  });

  it("drops a score the API would refuse rather than sending it", () => {
    const evidence = buildInsightEvidence(
      progress(),
      competency({ current_score: 140, diagnostic_score: -5 }),
    );

    assert.equal(evidence, null);
  });

  it("keeps one usable score when the other is missing", () => {
    const evidence = buildInsightEvidence(
      progress(),
      competency({ diagnostic_score: null, current_score: 55 }),
    );

    assert.equal(evidence.diagnosticScore, null);
    assert.equal(evidence.currentScore, 55);
  });

  it("normalises counts to whole numbers of zero or more", () => {
    const evidence = buildInsightEvidence(
      progress(),
      competency({ attempt_count: 6.7, unsuccessful_attempts: -2 }),
    );

    assert.equal(evidence.attemptCount, 6);
    assert.equal(evidence.unsuccessfulAttempts, null);
  });

  it("asks for nothing when there is no competency to ask about", () => {
    assert.equal(buildInsightEvidence(progress(), null), null);
    assert.equal(buildInsightEvidence(progress(), {}), null);
  });

  it("asks for nothing when the competency has no score at all", () => {
    const blank = competency({ current_score: null, diagnostic_score: null });
    assert.equal(buildInsightEvidence(progress(), blank), null);
  });

  it("survives a progress payload that failed to load", () => {
    const evidence = buildInsightEvidence(null, competency());

    assert.deepEqual(evidence.completedModules, []);
    assert.equal(evidence.competencyId, "c-1");
  });
});

describe("readInsight", () => {
  const reply = (data) => ({ ok: true, status: 200, data });

  it("reads the advisory text and its provenance", () => {
    const insight = readInsight(
      reply({
        insight_summary: "  The learner is improving on integer multiplication.  ",
        provider: "groq",
        model: "llama-3.1",
        generated_at: "2026-09-20T08:00:00Z",
      }),
    );

    assert.equal(insight.text, "The learner is improving on integer multiplication.");
    assert.equal(insight.provider, "groq");
    assert.equal(insight.model, "llama-3.1");
    assert.equal(insight.generatedAt, "2026-09-20T08:00:00Z");
  });

  it("reports no provenance when the contract supplied none", () => {
    const insight = readInsight(reply({ insight_summary: "Something useful." }));

    assert.equal(insight.provider, null);
    assert.equal(insight.model, null);
    assert.equal(insight.generatedAt, null);
  });

  it("treats empty or whitespace-only text as nothing at all", () => {
    assert.equal(readInsight(reply({ insight_summary: "   " })), null);
    assert.equal(readInsight(reply({ insight_summary: "" })), null);
    assert.equal(readInsight(reply({ insight_summary: null })), null);
    assert.equal(readInsight(reply({})), null);
  });

  it("reads nothing from a refusal", () => {
    assert.equal(readInsight({ ok: false, status: 503, code: "groq_assistance_unavailable" }), null);
    assert.equal(readInsight(null), null);
    assert.equal(readInsight(undefined), null);
    assert.equal(readInsight({ ok: true, data: null }), null);
  });
});

describe("insightUnavailableReason", () => {
  it("says nothing when the call succeeded", () => {
    assert.equal(insightUnavailableReason({ ok: true, data: {} }), null);
    assert.equal(insightUnavailableReason(null), null);
  });

  it("does not invent a distinction the API cannot make", () => {
    // Disabled, timed out, upstream error and malformed reply are all the same
    // 503 with the same code; claiming to know which would be a guess.
    const disabled = insightUnavailableReason({
      ok: false,
      status: 503,
      code: "groq_assistance_unavailable",
    });
    const unreachable = insightUnavailableReason({ ok: false, status: null, code: "unreachable" });

    assert.equal(disabled, unreachable);
    assert.match(disabled, /unavailable right now/);
    assert.match(disabled, /progress below is unaffected/);
  });

  it("names a configuration problem as its own thing", () => {
    assert.match(
      insightUnavailableReason({ ok: false, status: null, code: "unconfigured" }),
      /not configured/,
    );
  });

  it("names an ended session as its own thing", () => {
    assert.match(
      insightUnavailableReason({ ok: false, status: null, code: "no_session" }),
      /Sign in again/,
    );
  });

  it("names a refusal of the role as its own thing", () => {
    assert.match(
      insightUnavailableReason({ ok: false, status: 403, code: "forbidden" }),
      /Teacher\/Administrator/,
    );
  });
});
