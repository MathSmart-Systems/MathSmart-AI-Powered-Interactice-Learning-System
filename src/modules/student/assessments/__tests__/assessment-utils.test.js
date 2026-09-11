import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attemptStatusLabel,
  initialDiagnosticScreen,
  mockAssessmentHistory,
  normalizeAttemptHistory,
  parseAttemptQuery,
  submissionConfirmation,
} from "../utils.js";

describe("assessment attempt status", () => {
  it("normalizes canonical statuses and preserves an unknown readable status", () => {
    assert.equal(attemptStatusLabel("in_progress"), "In progress");
    assert.equal(attemptStatusLabel("scored"), "Scored");
    assert.equal(attemptStatusLabel("awaiting_review"), "awaiting review");
    assert.equal(attemptStatusLabel(null), "Status unavailable");
  });

  it("normalizes live history and creates reports only for scored diagnostics", () => {
    const attempts = normalizeAttemptHistory([
      { attempt_id: "mine", assessment_id: "assessment", title: "Diagnostic", type: "diagnostic", status: "scored", overall_score: "75" },
      { attempt_id: "quiz", assessment_id: "assessment-2", type: "unit_quiz", status: "scored", overall_score: null },
      null,
    ]);

    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].score, 75);
    assert.equal(attempts[0].reportHref, "/student/assessments/diagnostic?attempt=mine");
    assert.equal(attempts[1].reportHref, null);
  });

  it("returns deterministic ready history for mock mode", () => {
    assert.deepEqual(mockAssessmentHistory(), {
      state: "ready",
      attempts: [],
      meta: { page: 1, page_size: 20, total: 0 },
    });
  });

  it("normalizes empty and malformed mock/live values safely", () => {
    assert.deepEqual(normalizeAttemptHistory(null), []);
    assert.deepEqual(normalizeAttemptHistory([{}, { attempt_id: "missing-assessment" }]), []);
  });
});

describe("diagnostic attempt query", () => {
  it("accepts canonical UUIDs", () => {
    const attemptId = "123e4567-e89b-42d3-a456-426614174000";
    assert.deepEqual(parseAttemptQuery(attemptId), { attemptId, invalid: false });
  });

  it("rejects malformed, empty, and repeated attempt values", () => {
    for (const value of ["", "not-a-uuid", "{123e4567-e89b-42d3-a456-426614174000}", ["123e4567-e89b-42d3-a456-426614174000", "other"]]) {
      assert.deepEqual(parseAttemptQuery(value), { attemptId: null, invalid: true });
    }
  });

  it("treats an absent attempt query as ordinary diagnostic discovery", () => {
    assert.deepEqual(parseAttemptQuery(undefined), { attemptId: null, invalid: false });
  });
});

describe("diagnostic initial state", () => {
  it("gives an explicit requested report precedence", () => {
    assert.deepEqual(initialDiagnosticScreen({ diagnostic_status: "in_progress" }, "attempt-1"), {
      screen: "report",
      attemptId: "attempt-1",
    });
  });

  it("selects resume, pending, completed report, and intro states", () => {
    assert.equal(initialDiagnosticScreen({ diagnostic_status: "in_progress", latest_attempt_id: "a" }).screen, "resume");
    assert.equal(initialDiagnosticScreen({ latest_status: "submitted" }).screen, "pending");
    assert.equal(initialDiagnosticScreen({ diagnostic_status: "completed", latest_attempt_id: "a" }).screen, "report");
    assert.equal(initialDiagnosticScreen({ diagnostic_status: "not_started" }).screen, "intro");
  });
});

describe("submission confirmation", () => {
  const questions = [{ id: "one" }, { id: "two" }];

  it("requires confirmation even when every question is answered", () => {
    const result = submissionConfirmation(questions, { one: "1", two: "2" });
    assert.equal(result.isComplete, true);
    assert.equal(result.unansweredCount, 0);
    assert.match(result.message, /Confirm/);
  });

  it("counts whitespace and missing values as unanswered", () => {
    const result = submissionConfirmation(questions, { one: "  " });
    assert.equal(result.isComplete, false);
    assert.equal(result.unansweredCount, 2);
    assert.deepEqual(result.unanswered, questions);
  });
});
