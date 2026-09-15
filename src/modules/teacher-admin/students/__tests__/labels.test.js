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
  diagnosticStatus,
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