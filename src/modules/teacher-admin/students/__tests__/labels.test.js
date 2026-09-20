/**
 * Unit tests for the roster status vocabulary.
 *
 * These pin the exact label and tone the roster renders for every enum value
 * the API can return, so a badge tone is never the only way a state is shown
 * and so a new status cannot slip through as "Not available".
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DIAGNOSTIC_STATUS,
  MONITORING_STATUS,
  accountStatus,
  diagnosticStatus,
  isDropped,
  monitoringStatus,
} from "../utils/labels.js";

describe("diagnosticStatus", () => {
  it("labels every canonical status", () => {
    assert.deepEqual(
      Object.keys(DIAGNOSTIC_STATUS).sort(),
      ["completed", "in_progress", "not_started"].sort()
    );
  });

  it("renders not_started as a pending outline state", () => {
    assert.deepEqual(diagnosticStatus("not_started"), {
      label: "Not started",
      variant: "outline",
    });
  });

  it("renders completed as the achieved state", () => {
    assert.deepEqual(diagnosticStatus("completed"), {
      label: "Completed",
      variant: "default",
    });
  });

  it("falls back safely for an unknown status", () => {
    assert.deepEqual(diagnosticStatus("mystery"), {
      label: "Not available",
      variant: "outline",
    });
  });
});

describe("monitoringStatus", () => {
  it("labels every canonical status", () => {
    assert.deepEqual(
      Object.keys(MONITORING_STATUS).sort(),
      ["active", "improving", "inactive", "mastered", "needs_intervention"].sort()
    );
  });

  it("marks needs_intervention as the only destructive tone", () => {
    assert.deepEqual(monitoringStatus("needs_intervention"), {
      label: "Needs intervention",
      variant: "destructive",
    });
  });

  it("marks mastered as the achieved state", () => {
    assert.deepEqual(monitoringStatus("mastered"), {
      label: "Mastered",
      variant: "default",
    });
  });

  it("renders active as the quiet default state", () => {
    assert.deepEqual(monitoringStatus("active"), {
      label: "Active",
      variant: "secondary",
    });
  });

  it("falls back safely for an unknown status", () => {
    assert.deepEqual(monitoringStatus("mystery"), {
      label: "Not available",
      variant: "outline",
    });
  });
});

describe("accountStatus", () => {
  it("says nothing about an active account, which is the unremarkable case", () => {
    assert.equal(accountStatus("active"), null);
  });

  it("calls an archived account dropped, in the marking-pen tone", () => {
    assert.deepEqual(accountStatus("archived"), { label: "Dropped", variant: "destructive" });
  });

  it("names a suspended account without shouting about it", () => {
    assert.deepEqual(accountStatus("suspended"), { label: "Suspended", variant: "outline" });
  });

  it("says nothing for a status it does not recognise", () => {
    assert.equal(accountStatus("something_new"), null);
    assert.equal(accountStatus(undefined), null);
    assert.equal(accountStatus(null), null);
  });
});

describe("isDropped", () => {
  it("recognises a dropped learner", () => {
    assert.equal(isDropped({ account_status: "archived" }), true);
  });

  it("treats every other state as still enrolled", () => {
    assert.equal(isDropped({ account_status: "active" }), false);
    assert.equal(isDropped({ account_status: "suspended" }), false);
    // An older reply with no status at all is not a dropped learner.
    assert.equal(isDropped({}), false);
    assert.equal(isDropped(null), false);
  });
});
