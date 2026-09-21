/**
 * Unit tests for what the reader is allowed to tell a learner about finishing.
 *
 * `app.module_is_satisfied` decides completion from a passed activity, falling
 * back to reading only where there is no activity to pass. These tests hold the
 * words on screen to that rule, and in particular to the one sentence it must
 * never produce: a learner who has read every section of a lesson whose
 * activity they have not passed has not finished it, and must not be told they
 * have.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  completionRule,
  FINISHED,
  PASS_THE_ACTIVITY,
  practiceActivities,
  READ_IT_ALL,
} from "../utils/completion.js";

describe("practiceActivities", () => {
  it("keeps the activities a learner can actually open", () => {
    const kept = practiceActivities([
      { id: "a1", title: "Integer Sign Practice", status: "published" },
      { id: "a2", title: "Extra Practice", status: null },
    ]);

    assert.deepEqual(
      kept.map((activity) => activity.id),
      ["a1", "a2"],
    );
  });

  it("drops an activity that is certainly not a learner's to attempt", () => {
    assert.deepEqual(
      practiceActivities([
        { id: "a1", title: "Draft", status: "draft" },
        { id: "a2", title: "Archived", status: "archived" },
      ]),
      [],
    );
  });

  it("drops an activity with no id, because it cannot be opened", () => {
    assert.deepEqual(practiceActivities([{ id: null, title: "Nameless", status: "published" }]), []);
  });

  it("survives a payload that carries no activities at all", () => {
    assert.deepEqual(practiceActivities(), []);
    assert.deepEqual(practiceActivities(null), []);
    assert.deepEqual(practiceActivities([]), []);
  });
});

describe("completionRule", () => {
  it("names the activity as the thing that finishes a lesson that has one", () => {
    const rule = completionRule({
      pathStatus: "in_progress",
      hasPracticeActivity: true,
      readingComplete: false,
    });

    assert.equal(rule.kind, PASS_THE_ACTIVITY);
    assert.equal(rule.title, "Passing the practice activity is what finishes this lesson.");
  });

  it("still names the activity once every section has been read", () => {
    // This is the case the old screen got wrong: a full reading bar, a
    // "Lesson complete" banner, and a path item that had not moved.
    const rule = completionRule({
      pathStatus: "in_progress",
      hasPracticeActivity: true,
      readingComplete: true,
    });

    assert.equal(rule.kind, PASS_THE_ACTIVITY);
    assert.equal(rule.title.includes("finished"), false);
  });

  it("says reading finishes a lesson that has no activity", () => {
    const rule = completionRule({
      pathStatus: "available",
      hasPracticeActivity: false,
      readingComplete: false,
    });

    assert.equal(rule.kind, READ_IT_ALL);
    assert.equal(rule.title, "Reading the whole lesson is what finishes it.");
  });

  it("credits a fully read lesson that has nothing to pass", () => {
    const rule = completionRule({
      pathStatus: "in_progress",
      hasPracticeActivity: false,
      readingComplete: true,
    });

    assert.equal(rule.kind, FINISHED);
    assert.equal(rule.title, "You have read all of this lesson.");
  });

  it("takes the path's word for it when the item is closed", () => {
    const passed = completionRule({
      pathStatus: "completed",
      hasPracticeActivity: true,
      readingComplete: false,
    });

    assert.equal(passed.kind, FINISHED);
    assert.equal(passed.detail.includes("passed its practice activity"), true);

    const read = completionRule({
      pathStatus: "completed",
      hasPracticeActivity: false,
      readingComplete: true,
    });

    assert.equal(read.kind, FINISHED);
    assert.equal(read.detail.includes("no practice activity"), true);
  });

  it("never claims a lesson is finished while an activity is still unpassed", () => {
    for (const readingComplete of [false, true]) {
      for (const pathStatus of [null, "available", "in_progress", "locked"]) {
        const rule = completionRule({ pathStatus, hasPracticeActivity: true, readingComplete });
        assert.notEqual(rule.kind, FINISHED);
        assert.equal(`${rule.title} ${rule.detail}`.includes("You have finished"), false);
      }
    }
  });
});
