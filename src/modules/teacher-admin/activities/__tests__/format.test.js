/**
 * Unit tests for activity formatting helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatActivityStatus,
  formatDate,
  formatDuration,
  formatMasteryThreshold,
  formatPoints,
} from "../utils/format.js";

describe("formatDuration", () => {
  it("formats minutes under an hour", () => {
    assert.equal(formatDuration(15), "15 mins");
    assert.equal(formatDuration(1), "1 min");
  });

  it("formats exact hours", () => {
    assert.equal(formatDuration(60), "1 hr");
    assert.equal(formatDuration(120), "2 hrs");
  });

  it("formats hours and minutes combined", () => {
    assert.equal(formatDuration(90), "1 hr 30 mins");
    assert.equal(formatDuration(61), "1 hr 1 min");
  });

  it("formats a duration that arrived as a string", () => {
    assert.equal(formatDuration("45"), "45 mins");
  });

  it("has nothing to show for a missing or impossible duration", () => {
    assert.equal(formatDuration(null), "—");
    assert.equal(formatDuration(-5), "—");
    assert.equal(formatDuration(0), "—");
    assert.equal(formatDuration("not a number"), "—");
  });
});

describe("formatActivityStatus", () => {
  it("names a Badge variant rather than a colour", () => {
    assert.equal(formatActivityStatus("published").tone, "default");
    assert.equal(formatActivityStatus("draft").tone, "outline");
    assert.equal(formatActivityStatus("archived").tone, "secondary");
  });

  it("carries a shape for every state, so colour is never the only signal", () => {
    assert.equal(typeof formatActivityStatus("published").icon, "string");
    assert.equal(typeof formatActivityStatus("draft").icon, "string");
    assert.equal(typeof formatActivityStatus("archived").icon, "string");
  });

  it("labels each publication state", () => {
    assert.equal(formatActivityStatus("published").label, "Published");
    assert.equal(formatActivityStatus("draft").label, "Draft");
    assert.equal(formatActivityStatus("archived").label, "Archived");
  });

  it("reads an unknown or missing status as a draft", () => {
    assert.equal(formatActivityStatus(null).value, "draft");
    assert.equal(formatActivityStatus(undefined).value, "draft");
    assert.equal(formatActivityStatus("unexpected").value, "draft");
  });
});

describe("formatPoints", () => {
  it("formats integer points", () => {
    assert.equal(formatPoints(100), "100 pts");
    assert.equal(formatPoints(1), "1 pt");
    assert.equal(formatPoints(0), "0 pts");
  });

  it("formats string points", () => {
    assert.equal(formatPoints("50"), "50 pts");
  });

  it("falls back to 0 pts for invalid values", () => {
    assert.equal(formatPoints(null), "0 pts");
    assert.equal(formatPoints(-10), "0 pts");
    assert.equal(formatPoints("invalid"), "0 pts");
  });
});

describe("formatMasteryThreshold", () => {
  it("formats percentage threshold", () => {
    assert.equal(formatMasteryThreshold(75), "75% to pass");
    assert.equal(formatMasteryThreshold(80), "80% to pass");
  });

  it("formats string threshold", () => {
    assert.equal(formatMasteryThreshold("85"), "85% to pass");
  });

  it("falls back to 75% for out of bounds values", () => {
    assert.equal(formatMasteryThreshold(null), "75% to pass");
    assert.equal(formatMasteryThreshold(0), "75% to pass");
    assert.equal(formatMasteryThreshold(105), "75% to pass");
  });
});

describe("formatDate", () => {
  it("formats a timestamp day-first", () => {
    const formatted = formatDate("2026-03-14T08:00:00Z");
    assert.match(formatted, /14\s+Mar\s+2026/);
  });

  it("resolves the date in the school's own time zone (Asia/Manila)", () => {
    // 2026-03-14 23:30 UTC is 2026-03-15 07:30 in Manila (UTC+8)
    const formatted = formatDate("2026-03-14T23:30:00Z");
    assert.match(formatted, /15\s+Mar\s+2026/);
  });

  it("normalizes September to 3-letter Sep", () => {
    const formatted = formatDate("2026-09-12T04:00:00Z");
    assert.match(formatted, /12\s+Sep\s+2026/);
    assert.doesNotMatch(formatted, /Sept/);
  });

  it("has nothing to show for a missing or unreadable date", () => {
    assert.equal(formatDate(null), "—");
    assert.equal(formatDate(""), "—");
    assert.equal(formatDate("invalid-date"), "—");
  });
});
