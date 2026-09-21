/**
 * Unit tests for how the reader decides a section has been read.
 *
 * These are the two judgements that replaced the checklist, so they are the two
 * a learner can no longer make on their own behalf. The tests pin the cases
 * that matter: a section flicked past is not a section read, a worked example
 * taller than the window can still be read, and a learner scrolling back over a
 * lesson they have already read produces no request at all.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isOnScreenEnough, progressPayload } from "../utils/reading.js";

describe("isOnScreenEnough", () => {
  it("accepts most of a short section", () => {
    assert.equal(
      isOnScreenEnough({ visibleHeight: 180, sectionHeight: 300, viewportHeight: 800 }),
      true,
    );
  });

  it("refuses a section barely poking into the window", () => {
    assert.equal(
      isOnScreenEnough({ visibleHeight: 40, sectionHeight: 300, viewportHeight: 800 }),
      false,
    );
  });

  it("lets a section taller than the window count once it fills half the screen", () => {
    // Six tenths of this section is 960px and the window is 800px, so the
    // fraction alone could never be satisfied however carefully it was read.
    assert.equal(
      isOnScreenEnough({ visibleHeight: 400, sectionHeight: 1600, viewportHeight: 800 }),
      true,
    );
    assert.equal(
      isOnScreenEnough({ visibleHeight: 320, sectionHeight: 1600, viewportHeight: 800 }),
      false,
    );
  });

  it("tolerates a fractional layout height in a fully visible section", () => {
    assert.equal(
      isOnScreenEnough({ visibleHeight: 199.6, sectionHeight: 200, viewportHeight: 800 }),
      true,
    );
  });

  it("answers no to a measurement it cannot trust", () => {
    assert.equal(isOnScreenEnough({ visibleHeight: 0, sectionHeight: 300, viewportHeight: 800 }), false);
    assert.equal(isOnScreenEnough({ visibleHeight: 100, sectionHeight: 0, viewportHeight: 800 }), false);
    assert.equal(isOnScreenEnough({ visibleHeight: 100, sectionHeight: 300, viewportHeight: 0 }), false);
    assert.equal(isOnScreenEnough({}), false);
  });
});

describe("progressPayload", () => {
  const orderedIds = ["objective", "concept", "rule_1", "rule_2", "example_1"];

  it("sends everything the server knows plus what was just read, in lesson order", () => {
    const payload = progressPayload({
      orderedIds,
      confirmedIds: ["objective", "rule_1"],
      justRead: ["example_1", "concept"],
    });

    assert.deepEqual(payload.completedSectionIds, [
      "objective",
      "concept",
      "rule_1",
      "example_1",
    ]);
  });

  it("reports the last section the learner was in, not the furthest they reached", () => {
    const payload = progressPayload({
      orderedIds,
      confirmedIds: [],
      justRead: ["example_1", "rule_2"],
    });

    assert.equal(payload.lastSectionId, "rule_2");
  });

  it("makes no request when the reading adds nothing", () => {
    assert.equal(
      progressPayload({ orderedIds, confirmedIds: ["objective"], justRead: ["objective"] }),
      null,
    );
    assert.equal(progressPayload({ orderedIds, confirmedIds: [], justRead: [] }), null);
  });

  it("drops a section this lesson does not have rather than sending it to be refused", () => {
    assert.equal(
      progressPayload({ orderedIds, confirmedIds: [], justRead: ["rule_9"] }),
      null,
    );

    const payload = progressPayload({
      orderedIds,
      confirmedIds: [],
      justRead: ["rule_9", "concept"],
    });
    assert.deepEqual(payload.completedSectionIds, ["concept"]);
    assert.equal(payload.lastSectionId, "concept");
  });

  it("counts a section read twice in one batch once", () => {
    const payload = progressPayload({
      orderedIds,
      confirmedIds: [],
      justRead: ["concept", "rule_1", "concept"],
    });

    assert.deepEqual(payload.completedSectionIds, ["concept", "rule_1"]);
    assert.equal(payload.lastSectionId, "rule_1");
  });

  it("defends itself against being called with nothing", () => {
    assert.equal(progressPayload({}), null);
  });
});
