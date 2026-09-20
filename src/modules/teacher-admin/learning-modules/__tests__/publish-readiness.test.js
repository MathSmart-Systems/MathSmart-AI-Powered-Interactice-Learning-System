import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { modulePublishBlockers } from "../utils/publish-readiness.js";

const COMPLETE_RULE = {
  title: "Add the ones first",
  explanation: "Regroup when the ones column reaches ten.",
};

const COMPLETE_EXAMPLE = {
  problem: "27 + 45",
  solution: "72",
};

describe("modulePublishBlockers", () => {
  it("finds nothing in the way of a finished module", () => {
    const blockers = modulePublishBlockers({
      rules: [COMPLETE_RULE],
      workedExamples: [COMPLETE_EXAMPLE],
      competencyStatus: "published",
    });

    assert.deepEqual(blockers, []);
  });

  it("asks for a rule and a worked example when the module has neither", () => {
    const blockers = modulePublishBlockers({
      rules: [],
      workedExamples: [],
      competencyStatus: "published",
    });

    assert.equal(blockers.length, 2);
    assert.match(blockers[0], /core rule/);
    assert.match(blockers[1], /worked example/);
  });

  it("does not count a half-written rule", () => {
    // A rule with a title and no explanation teaches nothing, which is the
    // same refusal the author dialog gives.
    const blockers = modulePublishBlockers({
      rules: [{ title: "Add the ones first", explanation: "" }],
      workedExamples: [COMPLETE_EXAMPLE],
      competencyStatus: "published",
    });

    assert.equal(blockers.length, 1);
    assert.match(blockers[0], /core rule/);
  });

  it("does not count a worked example with no solution", () => {
    const blockers = modulePublishBlockers({
      rules: [COMPLETE_RULE],
      workedExamples: [{ problem: "27 + 45", solution: "" }],
      competencyStatus: "published",
    });

    assert.equal(blockers.length, 1);
    assert.match(blockers[0], /worked example/);
  });

  it("accepts a finished rule sitting beside an unfinished one", () => {
    const blockers = modulePublishBlockers({
      rules: [{ title: "Started", explanation: "" }, COMPLETE_RULE],
      workedExamples: [COMPLETE_EXAMPLE],
      competencyStatus: "published",
    });

    assert.deepEqual(blockers, []);
  });

  it("names the competency when it is still a draft", () => {
    const blockers = modulePublishBlockers({
      rules: [COMPLETE_RULE],
      workedExamples: [COMPLETE_EXAMPLE],
      competencyStatus: "draft",
    });

    assert.equal(blockers.length, 1);
    assert.match(blockers[0], /competency/);
  });

  it("stays quiet about a competency whose status could not be read", () => {
    // The competency read degrades on its own. Guessing "not published" would
    // hide Publish behind a refusal the teacher could do nothing about, and
    // the API enforces the rule itself.
    const blockers = modulePublishBlockers({
      rules: [COMPLETE_RULE],
      workedExamples: [COMPLETE_EXAMPLE],
      competencyStatus: null,
    });

    assert.deepEqual(blockers, []);
  });

  it("treats a module with nothing passed in as unpublishable", () => {
    const blockers = modulePublishBlockers();

    assert.equal(blockers.length, 2);
  });
});
