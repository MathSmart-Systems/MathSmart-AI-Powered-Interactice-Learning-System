/**
 * The one status a row shows, and the filter that chooses which rows there are.
 *
 * The defect these exist for: a dropped learner used to render a "Dropped"
 * badge under their name while the Status column, reading `monitoring_status`,
 * said "Active" on the very same row.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { accountStatus, isDropped, learnerStatus, monitoringStatus } from "../utils/labels.js";
import {
  ROSTER_STATUS,
  ROSTER_STATUS_OPTIONS,
  rosterStatus,
  sectionCountLabel,
} from "../utils/roster.js";

function learner(overrides = {}) {
  return { account_status: "active", monitoring_status: "active", ...overrides };
}

describe("learnerStatus", () => {
  it("reads Dropped for an archived account, whatever the monitoring says", () => {
    const status = learnerStatus(learner({ account_status: "archived" }));
    assert.equal(status.label, "Dropped");
    assert.equal(status.variant, "destructive");
  });

  it("never reads Active for a dropped learner", () => {
    // The exact contradiction that was on screen.
    const status = learnerStatus(
      learner({ account_status: "archived", monitoring_status: "active" }),
    );
    assert.notEqual(status.label, "Active");
  });

  it("reads Suspended for a suspended account", () => {
    assert.equal(learnerStatus(learner({ account_status: "suspended" })).label, "Suspended");
  });

  it("reports monitoring for an account that is actually usable", () => {
    assert.equal(
      learnerStatus(learner({ monitoring_status: "needs_intervention" })).label,
      "Needs intervention",
    );
  });

  it("agrees with monitoringStatus whenever the account is active", () => {
    for (const value of ["active", "improving", "mastered", "inactive"]) {
      assert.deepEqual(
        learnerStatus(learner({ monitoring_status: value })),
        monitoringStatus(value),
      );
    }
  });

  it("says something rather than nothing for an unknown state", () => {
    assert.equal(learnerStatus({}).label, "Not available");
    assert.equal(learnerStatus(undefined).label, "Not available");
  });

  it("leaves an active account with no badge of its own", () => {
    // Which is why the Status column has to fall through to monitoring.
    assert.equal(accountStatus("active"), null);
    assert.equal(isDropped(learner()), false);
  });
});

describe("rosterStatus", () => {
  it("offers exactly the three the API accepts", () => {
    assert.deepEqual(
      ROSTER_STATUS_OPTIONS.map((option) => option.value),
      ["enrolled", "dropped", "all"],
    );
    assert.deepEqual(
      ROSTER_STATUS_OPTIONS.map((option) => option.label),
      ["Enrolled", "Dropped", "All students"],
    );
  });

  it("defaults to enrolled", () => {
    assert.equal(rosterStatus(undefined), ROSTER_STATUS.ENROLLED);
    assert.equal(rosterStatus(null), ROSTER_STATUS.ENROLLED);
  });

  it("refuses a value the API would reject rather than sending it", () => {
    assert.equal(rosterStatus("everyone"), ROSTER_STATUS.ENROLLED);
    assert.equal(rosterStatus("ALL"), ROSTER_STATUS.ENROLLED);
  });

  it("passes a supported value through untouched", () => {
    assert.equal(rosterStatus("dropped"), "dropped");
    assert.equal(rosterStatus("all"), "all");
  });
});

describe("sectionCountLabel", () => {
  it("counts enrolled learners under the enrolled view", () => {
    assert.equal(
      sectionCountLabel({ status: "enrolled", enrolled: 38, dropped: 4, shown: 38 }),
      "38 enrolled",
    );
  });

  it("counts dropped learners under the dropped view", () => {
    assert.equal(
      sectionCountLabel({ status: "dropped", enrolled: 38, dropped: 4, shown: 4 }),
      "4 dropped",
    );
  });

  it("says both under all students", () => {
    assert.equal(
      sectionCountLabel({ status: "all", enrolled: 38, dropped: 4, shown: 42 }),
      "38 enrolled · 4 dropped",
    );
  });

  it("admits when the page is holding fewer than the section has", () => {
    assert.equal(
      sectionCountLabel({ status: "enrolled", enrolled: 72, dropped: 0, shown: 38 }),
      "72 enrolled, 38 shown",
    );
  });

  it("stays silent about truncation when there is none", () => {
    const label = sectionCountLabel({ status: "enrolled", enrolled: 3, dropped: 0, shown: 3 });
    assert.ok(!label.includes("shown"));
  });

  it("counts both sides toward truncation under all students", () => {
    assert.equal(
      sectionCountLabel({ status: "all", enrolled: 40, dropped: 32, shown: 50 }),
      "40 enrolled · 32 dropped, 50 shown",
    );
  });

  it("answers for a section with nobody in it", () => {
    assert.equal(
      sectionCountLabel({ status: "enrolled", enrolled: 0, dropped: 0, shown: 0 }),
      "0 enrolled",
    );
  });
});
