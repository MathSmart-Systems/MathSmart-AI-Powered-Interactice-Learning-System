/**
 * Unit tests for the activities formatting helpers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  completionPercent,
  formatAnsweredCount,
  formatBestScore,
  formatMinutes,
  formatPercent,
  formatPoints,
  formatTimeSpent,
} from "../utils/format.js";

describe("formatPercent", () => {
  it("renders a rounded percentage", () => {
    assert.equal(formatPercent(0), "0%");
    assert.equal(formatPercent(72.4), "72%");
    assert.equal(formatPercent(100), "100%");
  });

  it("says nothing when there is no score", () => {
    assert.equal(formatPercent(null), null);
    assert.equal(formatPercent(Number.NaN), null);
    assert.equal(formatPercent("80"), null);
  });
});

describe("formatBestScore", () => {
  it("reads like a percentage for a learner", () => {
    assert.equal(formatBestScore(82.5), "83%");
    assert.equal(formatBestScore(null), null);
  });
});

describe("formatPoints", () => {
  it("pluralises correctly and ignores nonsense", () => {
    assert.equal(formatPoints(1), "1 point");
    assert.equal(formatPoints(12.6), "13 points");
    assert.equal(formatPoints(0), null);
    assert.equal(formatPoints(-5), null);
    assert.equal(formatPoints(null), null);
  });
});

describe("formatMinutes", () => {
  it("estimates in whole minutes", () => {
    assert.equal(formatMinutes(15), "About 15 minutes");
    assert.equal(formatMinutes(1), "About 1 minute");
    assert.equal(formatMinutes(0.4), null);
    assert.equal(formatMinutes(null), null);
  });
});

describe("formatAnsweredCount and completionPercent", () => {
  it("counts answered against total", () => {
    assert.deepEqual(formatAnsweredCount(2, 8), { finished: 2, total: 8, text: "2 of 8" });
    assert.equal(completionPercent(2, 8), 25);
    assert.equal(completionPercent(8, 8), 100);
  });

  it("clamps and never divides by zero", () => {
    assert.equal(completionPercent(0, 0), null);
    assert.equal(completionPercent(2, 0), null);
    assert.deepEqual(formatAnsweredCount(20, 8), { finished: 8, total: 8, text: "8 of 8" });
  });
});

describe("formatTimeSpent", () => {
  it("rounds up to a whole minute", () => {
    assert.equal(formatTimeSpent(180), "3 min");
    assert.equal(formatTimeSpent(30), "1 min");
    assert.equal(formatTimeSpent(0), null);
    assert.equal(formatTimeSpent(null), null);
  });
});