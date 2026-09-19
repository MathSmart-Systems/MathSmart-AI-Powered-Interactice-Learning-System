import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCaseAIEvidence,
  buildClassPatternAnalysisPayload,
  buildRemediationContext,
  formatGeneratedAt,
  provenanceLabel,
  readAdvisory,
} from "../utils/intervention-helpers.js";

const FORBIDDEN_FRAGMENTS = ["name", "email", "phone", "avatar", "address", "token", "secret"];
const VALID_RESULT = {
  ok: true,
  status: 200,
  data: {
    insight_summary: "  The learner would benefit from revisiting sign rules.  ",
    provider: "groq",
    model: "llama-3",
    generated_at: "2026-09-19T07:30:00Z",
    confidence_score: null,
  },
  error: null,
  code: null,
};

function collectKeys(value, keys = []) {
  if (Array.isArray(value) || typeof value !== "object" || value === null) return keys;
  for (const key of Object.keys(value)) {
    keys.push(key.toLowerCase());
    collectKeys(value[key], keys);
  }
  return keys;
}

function assertNoForbiddenKeys(payload) {
  const keys = collectKeys(payload);
  for (const key of keys) {
    for (const fragment of FORBIDDEN_FRAGMENTS) {
      assert.ok(
        !key.includes(fragment),
        `payload key "${key}" must not reach the adapter redaction filter`
      );
    }
  }
}

test("buildCaseAIEvidence maps a case detail into the teacher-insight evidence", () => {
  const detail = {
    competency: { id: "comp-1", code: "G-6", name: "Integers" },
    severity: "HIGH",
    status: "In Progress",
    evidence: {
      diagnostic_score: 51.2,
      current_score: 34,
      attempt_count: 6,
      unsuccessful_attempts: 3,
    },
    incorrect_patterns: ["Sign errors", "Order of operations"],
    modules_attempted: ["Number Line Review", "Practice Module"],
  };

  const evidence = buildCaseAIEvidence(detail);

  assert.equal(evidence.competencyId, "comp-1");
  assert.equal(evidence.diagnosticScore, 51.2);
  assert.equal(evidence.currentScore, 34);
  assert.equal(evidence.attemptCount, 6);
  assert.equal(evidence.unsuccessfulAttempts, 3);
  assert.deepEqual(evidence.incorrectPatterns, ["Sign errors", "Order of operations"]);
  assert.deepEqual(evidence.completedModules, ["Number Line Review", "Practice Module"]);
  assertNoForbiddenKeys(evidence);
});

test("buildCaseAIEvidence caps evidence arrays at the backend limit of twenty", () => {
  const detail = {
    competency: { id: "comp-1" },
    incorrect_patterns: Array.from({ length: 30 }, (_, index) => `pattern ${index}`),
    modules_attempted: Array.from({ length: 25 }, (_, index) => `module ${index}`),
  };

  const evidence = buildCaseAIEvidence(detail);

  assert.equal(evidence.incorrectPatterns.length, 20);
  assert.equal(evidence.completedModules.length, 20);
});

test("buildCaseAIEvidence degrades to a safe empty shape for a missing detail", () => {
  const evidence = buildCaseAIEvidence(null);

  assert.equal(evidence.competencyId, null);
  assert.equal(evidence.diagnosticScore, null);
  assert.equal(evidence.currentScore, null);
  assert.deepEqual(evidence.incorrectPatterns, []);
  assert.deepEqual(evidence.completedModules, []);
  assertNoForbiddenKeys(evidence);
});

test("buildRemediationContext carries deterministic scope and no identity", () => {
  const context = buildRemediationContext({
    competency: { id: "comp-1" },
    severity: "MEDIUM",
    status: "Needs Intervention",
    evidence: { current_score: 40 },
  });

  assert.equal(context.competencyId, "comp-1");
  assert.equal(context.currentScore, 40);
  assert.match(context.displayContext, /severity: MEDIUM/i);
  assert.match(context.displayContext, /Needs Intervention/i);
  assert.ok(context.displayContext.length <= 2000);
  assertNoForbiddenKeys(context);
});

test("buildRemediationContext never references an empty detail by name", () => {
  const context = buildRemediationContext({});

  assert.equal(context.competencyId, null);
  assert.equal(context.currentScore, null);
  assert.ok(context.displayContext.length <= 2000);
  assertNoForbiddenKeys(context);
});

test("readAdvisory returns a provenanced advisory when the reply has usable text", () => {
  const advisory = readAdvisory(VALID_RESULT, "insight_summary");

  assert.deepEqual(advisory, {
    text: "The learner would benefit from revisiting sign rules.",
    provider: "groq",
    model: "llama-3",
    generatedAt: "2026-09-19T07:30:00Z",
  });
});

test("readAdvisory returns null when Groq is disabled (503 groq_assistance_unavailable)", () => {
  const refusal = {
    ok: false,
    status: 503,
    data: null,
    error: "AI assistance is not available",
    code: "groq_assistance_unavailable",
  };

  assert.equal(readAdvisory(refusal, "insight_summary"), null);
});

test("readAdvisory returns null on a client timeout", () => {
  const timeout = {
    ok: false,
    status: null,
    data: null,
    error: "The request took too long.",
    code: "request_timeout",
  };

  assert.equal(readAdvisory(timeout, "insight_summary"), null);
});

test("readAdvisory returns null on a malformed reply with no text field", () => {
  const malformed = { ok: true, status: 200, data: { provider: "groq" }, error: null };

  assert.equal(readAdvisory(malformed, "insight_summary"), null);
});

test("readAdvisory returns null on an empty or whitespace-only reply", () => {
  const empty = { ok: true, status: 200, data: { insight_summary: "   " } };

  assert.equal(readAdvisory(empty, "insight_summary"), null);
});

test("readAdvisory returns null for a non-object reply", () => {
  assert.equal(readAdvisory(undefined, "insight_summary"), null);
  assert.equal(readAdvisory(null, "insight_summary"), null);
});

test("formatGeneratedAt renders a timestamp or an em dash", () => {
  assert.notEqual(formatGeneratedAt("2026-09-19T07:30:00Z"), "—");
  assert.equal(formatGeneratedAt(undefined), "—");
  assert.equal(formatGeneratedAt(null), "—");
  assert.equal(formatGeneratedAt("not-a-date"), "—");
});

test("provenanceLabel joins provider, model and time", () => {
  const label = provenanceLabel({ provider: "groq", model: "llama-3", generatedAt: null });

  assert.equal(label, "groq · llama-3");
  assert.equal(provenanceLabel(null), null);
});

test("buildClassPatternAnalysisPayload returns null without cases or scope", () => {
  assert.equal(buildClassPatternAnalysisPayload([], { gradeId: "g1" }), null);
  assert.equal(
    buildClassPatternAnalysisPayload([{ severity: "HIGH", status: "Needs Intervention" }], {}),
    null
  );
});

test("buildClassPatternAnalysisPayload aggregates severity and status without names", () => {
  const cases = [
    { severity: "HIGH", status: "Needs Intervention" },
    { severity: "MEDIUM", status: "Needs Intervention" },
    { severity: "LOW", status: "Resolved" },
  ];

  const payload = buildClassPatternAnalysisPayload(cases, {
    gradeId: "grade-1",
    competencyId: "comp-1",
    grades: [{ id: "grade-1", name: "Grade 6" }],
  });

  assert.equal(payload.grade, "Grade 6");
  assert.equal(payload.competencyId, "comp-1");
  assert.match(payload.displayContext, /3 intervention cases/);
  assert.match(payload.displayContext, /1 HIGH, 1 MEDIUM, 1 LOW/);
  assert.match(payload.displayContext, /2 Needs Intervention, 1 Resolved/);
  assert.match(payload.displayContext, /No individually identifying/);
  assert.deepEqual(payload.incorrectAttempts, []);
  assert.ok(payload.displayContext.length <= 2000);
  assertNoForbiddenKeys(payload);
});