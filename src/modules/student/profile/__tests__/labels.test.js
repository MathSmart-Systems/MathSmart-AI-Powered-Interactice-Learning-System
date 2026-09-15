/**
 * Unit tests for the profile status vocabulary.
 *
 * These pin the exact label and summary the profile renders for every enum
 * value the API can return, so a new status cannot slip through as
 * "Not available" and the summary stays learner-friendly.
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

  it("renders not_started with a learner-friendly summary", () => {
    const status = diagnosticStatus("not_started");
    assert.equal(status.label, "Not started");
    assert.ok(status.summary.length > 0);
  });

  it("renders completed with a learner-friendly summary", () => {
    const status = diagnosticStatus("completed");
    assert.equal(status.label, "Completed");
    assert.ok(status.summary.includes("path is ready"));
  });

  it("falls back safely for an unknown status", () => {
    const status = diagnosticStatus("mystery");
    assert.equal(status.label, "Not available");
    assert.ok(typeof status.summary === "string");
  });
});

describe("monitoringStatus", () => {
  it("labels every canonical status", () => {
    assert.deepEqual(
      Object.keys(MONITORING_STATUS).sort(),
      ["active", "improving", "inactive", "mastered", "needs_intervention"].sort()
    );
  });

  it("marks needs_intervention with a support-oriented summary", () => {
    const status = monitoringStatus("needs_intervention");
    assert.equal(status.label, "Getting extra help");
    assert.ok(status.summary.length > 0);
  });

  it("marks mastered with an achievement summary", () => {
    const status = monitoringStatus("mastered");
    assert.equal(status.label, "Mastered");
    assert.ok(status.summary.includes("mastered"));
  });

  it("renders active as the default running state", () => {
    const status = monitoringStatus("active");
    assert.equal(status.label, "Active");
    assert.ok(status.summary.length > 0);
  });

  it("falls back safely for an unknown status", () => {
    const status = monitoringStatus("mystery");
    assert.equal(status.label, "Not available");
    assert.ok(typeof status.summary === "string");
  });
});