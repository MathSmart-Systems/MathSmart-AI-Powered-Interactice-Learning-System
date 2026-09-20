import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activitySubmissionForAttempt,
  clearActivitySubmission,
} from "../utils/submission.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("activity submission retries", () => {
  it("reuses one key and the original body for the same attempt", () => {
    const localStorage = storage();
    const first = activitySubmissionForAttempt(
      "attempt-1",
      { answers: [{ question_id: "q-1", answer: "72" }], time_spent_seconds: 12 },
      localStorage,
    );
    const retry = activitySubmissionForAttempt(
      "attempt-1",
      { answers: [{ question_id: "q-1", answer: "changed" }], time_spent_seconds: 20 },
      localStorage,
    );

    assert.deepEqual(retry, first);
    assert.ok(first.idempotencyKey.length >= 8);
  });

  it("clears persisted submission only after confirmed success", () => {
    const localStorage = storage();
    const first = activitySubmissionForAttempt(
      "attempt-1",
      { answers: [], time_spent_seconds: 12 },
      localStorage,
    );

    clearActivitySubmission("attempt-1", localStorage);

    assert.notEqual(
      activitySubmissionForAttempt(
        "attempt-1",
        { answers: [], time_spent_seconds: 13 },
        localStorage,
      ).idempotencyKey,
      first.idempotencyKey,
    );
  });
});
