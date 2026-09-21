import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  READINESS_REASONS,
  describeActivityReadiness,
} from "../utils/readiness.js";

/** A published, working row, which the tests bend one field at a time. */
function row(overrides = {}) {
  return {
    activity_id: "11111111-1111-1111-1111-111111111111",
    title: "Adding unlike fractions",
    status: "published",
    question_count: 6,
    is_ready: true,
    ...overrides,
  };
}

describe("describeActivityReadiness", () => {
  it("says nothing about a row a learner can actually start", () => {
    assert.equal(describeActivityReadiness(row()), null);
  });

  it("says nothing while the API is still not sending is_ready", () => {
    // The field arrives with a backend release, not with this one. Until then
    // every published activity would otherwise be branded unready, which is a
    // worse lie than the silence this replaces.
    const { is_ready: _unused, ...withoutField } = row();
    assert.equal(describeActivityReadiness(withoutField), null);
  });

  it("says nothing about a draft or an archived row", () => {
    // Neither is in front of a learner, so neither is broken. A draft that
    // holds nothing is normal: it is what an activity looks like before its
    // questions are chosen.
    assert.equal(describeActivityReadiness(row({ status: "draft", is_ready: false })), null);
    assert.equal(
      describeActivityReadiness(row({ status: "archived", is_ready: false })),
      null,
    );
  });

  it("says nothing about a row that is not a record at all", () => {
    assert.equal(describeActivityReadiness(null), null);
    assert.equal(describeActivityReadiness(undefined), null);
    assert.equal(describeActivityReadiness("published"), null);
  });

  it("names an empty published activity from the row alone", () => {
    const result = describeActivityReadiness(row({ is_ready: false, question_count: 0 }));
    assert.equal(result.reason, READINESS_REASONS.NO_QUESTIONS);
    assert.equal(result.label, "Not ready");
    assert.equal(result.headline, "No questions yet");
    assert.match(result.detail, /Choose its questions/);
  });

  it("treats a missing or unreadable count as no questions", () => {
    // A row that cannot say how many questions it holds is not evidence that it
    // holds some, and this is the one case the browser can settle on its own.
    for (const question_count of [undefined, null, "", "many", -3]) {
      const result = describeActivityReadiness(row({ is_ready: false, question_count }));
      assert.equal(result.reason, READINESS_REASONS.NO_QUESTIONS);
    }
  });

  it("names a draft question when the row names it", () => {
    const result = describeActivityReadiness(
      row({ is_ready: false, readiness_reason: "draft_question" }),
    );
    assert.equal(result.reason, READINESS_REASONS.DRAFT_QUESTION);
    assert.equal(result.headline, "A question is still a draft");
  });

  it("names a draft competency when the row names it", () => {
    const result = describeActivityReadiness(
      row({ is_ready: false, readiness_reason: "DRAFT_COMPETENCY" }),
    );
    assert.equal(result.reason, READINESS_REASONS.DRAFT_COMPETENCY);
    assert.equal(result.headline, "A question's competency is still a draft");
  });

  it("names a draft learning module when the row names it", () => {
    // An activity has one dependency an assessment does not: a learner cannot
    // open anything inside a module that has not been published.
    const result = describeActivityReadiness(
      row({ is_ready: false, readiness_reason: " draft_module " }),
    );
    assert.equal(result.reason, READINESS_REASONS.DRAFT_MODULE);
    assert.equal(result.headline, "Its learning module is still a draft");
  });

  it("stops at what it knows when nothing names the dependency", () => {
    // `is_ready` is one boolean. Guessing a specific cause from it would send a
    // teacher to publish a competency that was published all along.
    for (const readiness_reason of [undefined, null, "", "unknown", "something_else", 7]) {
      const result = describeActivityReadiness(row({ is_ready: false, readiness_reason }));
      assert.equal(result.reason, READINESS_REASONS.UNKNOWN);
      assert.equal(result.headline, "Something it depends on is still a draft");
    }
  });

  it("reads a status that arrived cased or padded differently", () => {
    const result = describeActivityReadiness(
      row({ status: " Published ", is_ready: false, question_count: 0 }),
    );
    assert.equal(result.headline, "No questions yet");
  });

  it("carries a word beside the badge rather than a colour", () => {
    // The badge is read by people who cannot see its red, and printed in
    // greyscale on the workspace handouts, so the label has to carry the state.
    const result = describeActivityReadiness(row({ is_ready: false, question_count: 0 }));
    assert.equal(result.label, "Not ready");
  });
});
