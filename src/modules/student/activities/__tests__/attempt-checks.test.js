/**
 * Unit tests for the resumed-attempt verdict rules.
 *
 * The property these protect is a narrow one and matters more than it looks: a
 * restored verdict must be one the server actually gave, for the answer it
 * actually judged. Everything else — a changed answer, a half-written store, a
 * question that is no longer in the attempt — has to come back as no verdict at
 * all, because a wrong verdict on a learner's screen is worse than none.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checksStorageKey,
  fromStoredChecks,
  normalizeAnswer,
  toStoredChecks,
} from "../utils/attempt-checks.js";

const CORRECT = {
  isCorrect: true,
  attemptsForQuestion: 2,
  feedback: "Two negative factors make a positive product.",
  hintAvailable: true,
};

describe("checksStorageKey", () => {
  it("scopes the store to one attempt", () => {
    assert.equal(checksStorageKey("attempt-1"), "mathsmart.activity-checks.attempt-1");
  });

  it("has no key without an attempt", () => {
    assert.equal(checksStorageKey(null), null);
    assert.equal(checksStorageKey(""), null);
  });
});

describe("normalizeAnswer", () => {
  it("compares answers as trimmed text, whatever JSON held them", () => {
    assert.equal(normalizeAnswer(72), "72");
    assert.equal(normalizeAnswer("  72 "), "72");
  });

  it("treats a missing or blank answer as nothing to match", () => {
    assert.equal(normalizeAnswer(null), null);
    assert.equal(normalizeAnswer(undefined), null);
    assert.equal(normalizeAnswer("   "), null);
  });
});

describe("toStoredChecks", () => {
  it("remembers each verdict with the answer it was given for", () => {
    const stored = toStoredChecks({ q1: CORRECT }, { q1: "72" });

    assert.deepEqual(stored, {
      q1: {
        isCorrect: true,
        attemptsForQuestion: 2,
        feedback: "Two negative factors make a positive product.",
        hintAvailable: true,
        answer: "72",
      },
    });
  });

  it("drops a verdict whose answer has gone", () => {
    assert.deepEqual(toStoredChecks({ q1: CORRECT }, {}), {});
    assert.deepEqual(toStoredChecks({ q1: CORRECT }, { q1: "  " }), {});
  });

  it("survives being given nothing", () => {
    assert.deepEqual(toStoredChecks(null, null), {});
    assert.deepEqual(toStoredChecks({ q1: null }, { q1: "72" }), {});
  });
});

describe("fromStoredChecks", () => {
  it("restores a verdict when the resumed answer still matches", () => {
    const stored = toStoredChecks({ q1: CORRECT }, { q1: "72" });

    assert.deepEqual(fromStoredChecks(stored, { q1: "72" }), {
      q1: {
        isCorrect: true,
        attemptsForQuestion: 2,
        feedback: "Two negative factors make a positive product.",
        hintAvailable: true,
      },
    });
  });

  it("keeps an incorrect verdict as incorrect", () => {
    const stored = toStoredChecks(
      { q1: { isCorrect: false, attemptsForQuestion: 1, feedback: "Check the signs." } },
      { q1: "-72" },
    );

    assert.equal(fromStoredChecks(stored, { q1: "-72" }).q1.isCorrect, false);
  });

  it("drops the verdict when the learner's answer has changed since", () => {
    const stored = toStoredChecks({ q1: CORRECT }, { q1: "72" });

    assert.deepEqual(fromStoredChecks(stored, { q1: "-72" }), {});
  });

  it("drops the verdict when the question is not in the resumed attempt", () => {
    const stored = toStoredChecks({ q1: CORRECT }, { q1: "72" });

    assert.deepEqual(fromStoredChecks(stored, { q2: "72" }), {});
  });

  it("never invents a verdict from a store that does not carry one", () => {
    assert.deepEqual(fromStoredChecks({ q1: { answer: "72" } }, { q1: "72" }), {});
    assert.deepEqual(fromStoredChecks({ q1: { isCorrect: "true", answer: "72" } }, { q1: "72" }), {});
  });

  it("survives a store that is missing, empty or not an object", () => {
    assert.deepEqual(fromStoredChecks(null, { q1: "72" }), {});
    assert.deepEqual(fromStoredChecks({}, { q1: "72" }), {});
    assert.deepEqual(fromStoredChecks("not a store", { q1: "72" }), {});
  });

  it("round-trips an attempt where only some answers were checked", () => {
    const answers = { q1: "72", q2: "8", q3: "" };
    const checks = { q1: CORRECT, q2: { isCorrect: false, attemptsForQuestion: 1 } };

    const restored = fromStoredChecks(toStoredChecks(checks, answers), answers);

    assert.deepEqual(Object.keys(restored).sort(), ["q1", "q2"]);
    assert.equal(restored.q2.attemptsForQuestion, 1);
    assert.equal(restored.q2.feedback, null);
    assert.equal(restored.q2.hintAvailable, false);
  });
});
