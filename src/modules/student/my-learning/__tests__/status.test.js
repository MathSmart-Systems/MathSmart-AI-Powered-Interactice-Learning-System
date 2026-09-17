/**
 * Unit tests for the My Learning status vocabulary.
 *
 * The point of these tests is the writing-out rule: every status the API
 * returns has a label and an action verb a Grade 6 learner can read, and no
 * status is ever expressed by colour alone.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { catalogueStatus, MODULE_STATUS, pathItemStatus } from "../utils/status.js";

describe("MODULE_STATUS", () => {
  it("freezes the four statuses a path item can hold", () => {
    assert.deepEqual(Object.keys(MODULE_STATUS), ["locked", "available", "in_progress", "completed"]);
  });
});

describe("pathItemStatus", () => {
  it("writes each status as a sentence and an action", () => {
    assert.deepEqual(pathItemStatus("locked"), { label: "Opens later", verb: "Open" });
    assert.deepEqual(pathItemStatus("available"), { label: "Ready to start", verb: "Start" });
    assert.deepEqual(pathItemStatus("in_progress"), { label: "In progress", verb: "Continue" });
    assert.deepEqual(pathItemStatus("completed"), { label: "Finished", verb: "Review" });
  });

  it("falls back safely for a status the backend never sent", () => {
    assert.deepEqual(pathItemStatus(null), { label: "Ready to start", verb: "Open" });
    assert.deepEqual(pathItemStatus("mystery"), { label: "Ready to start", verb: "Open" });
  });
});

describe("catalogueStatus", () => {
  it("lets completion speak louder than the path status", () => {
    assert.deepEqual(catalogueStatus({ pathStatus: "available", isComplete: true }), MODULE_STATUS.completed);
  });

  it("keeps the path status when the module is not finished", () => {
    assert.deepEqual(catalogueStatus({ pathStatus: "in_progress", isComplete: false }), MODULE_STATUS.in_progress);
  });

  it("reads a module off the path as ready to open", () => {
    assert.deepEqual(catalogueStatus({ pathStatus: null, isComplete: false }), { label: "Ready to start", verb: "Open" });
  });
});