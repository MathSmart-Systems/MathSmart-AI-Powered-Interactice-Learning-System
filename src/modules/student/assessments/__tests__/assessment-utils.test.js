import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attemptStatusLabel,
  clearSavedDraftAnswers,
  flattenDiagnosticQuestions,
  initialDiagnosticScreen,
  mockAssessmentHistory,
  normalizeAttemptHistory,
  numericShortcutIndex,
  parseAttemptQuery,
  reconcileDraftAnswers,
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
    assert.equal(attempts[1].score, null);
    assert.equal(attempts[1].reportHref, null);
  });

  it("preserves missing scores while accepting finite zero and numeric strings", () => {
    const values = [null, undefined, "", "  ", "bad", Infinity, 0, "0", "75"];
    const attempts = normalizeAttemptHistory(
      values.map((overall_score, index) => ({
        attempt_id: `attempt-${index}`,
        assessment_id: "assessment",
        overall_score,
      })),
    );

    assert.deepEqual(
      attempts.map((attempt) => attempt.score),
      [null, null, null, null, null, null, 0, 0, 75],
    );
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

describe("diagnostic question order", () => {
  it("sorts across domains before assigning display numbers", () => {
    const questions = flattenDiagnosticQuestions([
      {
        domain: "Fractions",
        questions: [
          { question_id: "three", question_text: "Third", order_index: 3 },
          { question_id: "one", question_text: "First", order_index: 1 },
        ],
      },
      {
        domain: "Decimals",
        questions: [{ question_id: "two", question_text: "Second", order_index: 2 }],
      },
    ]);

    assert.deepEqual(questions.map(({ id }) => id), ["one", "two", "three"]);
    assert.deepEqual(questions.map(({ number }) => number), [1, 2, 3]);
  });

  it("keeps equal and missing positions deterministic", () => {
    const questions = flattenDiagnosticQuestions([
      {
        domain: "General",
        questions: [
          { question_id: "first-equal", order_index: 1 },
          { question_id: "missing" },
          { question_id: "second-equal", order_index: 1 },
        ],
      },
    ]);

    assert.deepEqual(questions.map(({ id }) => id), ["first-equal", "second-equal", "missing"]);
    assert.deepEqual(questions.map(({ number }) => number), [1, 2, 3]);
  });
});

describe("diagnostic numeric shortcuts", () => {
  const event = (overrides = {}) => ({
    key: "1",
    defaultPrevented: false,
    repeat: false,
    isComposing: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    ...overrides,
  });

  it("accepts only an available plain ASCII digit", () => {
    assert.equal(numericShortcutIndex(event(), 4), 0);
    assert.equal(numericShortcutIndex(event({ key: "4" }), 4), 3);
    for (const key of ["0", "5", " ", "1.0", "١"]) {
      assert.equal(numericShortcutIndex(event({ key }), 4), null);
    }
  });

  it("rejects blocked, modified, repeated, composing, and handled events", () => {
    assert.equal(numericShortcutIndex(event(), 4, true), null);
    for (const property of [
      "defaultPrevented",
      "repeat",
      "isComposing",
      "ctrlKey",
      "metaKey",
      "altKey",
      "shiftKey",
    ]) {
      assert.equal(numericShortcutIndex(event({ [property]: true }), 4), null);
    }
  });
});

describe("diagnostic local drafts", () => {
  it("lets local answers override server answers and drops unknown questions", () => {
    assert.deepEqual(
      reconcileDraftAnswers(
        { one: "server", two: "saved", removed: "old" },
        { one: "local", three: "draft", unknown: "no" },
        new Set(["one", "two", "three"]),
      ),
      { one: "local", two: "saved", three: "draft" },
    );
  });

  it("clears matching saves without deleting a newer edit", () => {
    assert.deepEqual(
      clearSavedDraftAnswers(
        { one: "newer", two: "saved", three: "pending" },
        [
          { question_id: "one", answer: "older" },
          { question_id: "two", answer: "saved" },
        ],
      ),
      { one: "newer", three: "pending" },
    );
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
