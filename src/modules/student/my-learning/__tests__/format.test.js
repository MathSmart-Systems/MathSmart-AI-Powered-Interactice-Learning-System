/**
 * Unit tests for the My Learning presentation formatting.
 *
 * These functions only choose words and digits for values the API already
 * decided; the tests pin the wording so a learner reading the screen never has
 * to wonder which band a percentage falls into.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatMinutes,
  formatPercent,
  progressLabel,
  readingLabel,
  toNumber,
} from "../utils/format.js";

describe("toNumber", () => {
  it("keeps a finite number", () => {
    assert.equal(toNumber(15), 15);
    assert.equal(toNumber(0), 0);
  });

  it("rejects anything that is not a number", () => {
    assert.equal(toNumber(null), null);
    assert.equal(toNumber(undefined), null);
    assert.equal(toNumber("15"), null);
    assert.equal(toNumber(NaN), null);
    assert.equal(toNumber(Infinity), null);
  });
});

describe("formatMinutes", () => {
  it("writes whole minutes as words a learner can plan around", () => {
    assert.equal(formatMinutes(15), "About 15 minutes");
    assert.equal(formatMinutes(1), "About 1 minute");
    assert.equal(formatMinutes(2.4), "About 2 minutes");
  });

  it("stays silent when no estimate is given", () => {
    assert.equal(formatMinutes(null), null);
    assert.equal(formatMinutes(0), null);
    assert.equal(formatMinutes(-4), null);
  });
});

describe("formatPercent", () => {
  it("keeps a whole percent in range", () => {
    assert.equal(formatPercent(40), 40);
    assert.equal(formatPercent(40.6), 41);
  });

  it("clamps out-of-range answers", () => {
    assert.equal(formatPercent(-3), 0);
    assert.equal(formatPercent(150), 100);
  });

  it("leaves a missing answer unread", () => {
    assert.equal(formatPercent(null), null);
  });
});

describe("readingLabel", () => {
  it("reports reading as reading and never as completion", () => {
    assert.equal(readingLabel(42), "42% read");
    assert.equal(readingLabel(100), "All read");
  });

  it("refuses to print a fake zero for a lesson never opened", () => {
    assert.equal(readingLabel(0), "Not read yet");
    assert.equal(readingLabel(null), "Not read yet");
    assert.equal(readingLabel(undefined), "Not read yet");
  });

  it("never says a lesson is finished, whatever the number", () => {
    for (const percent of [0, 1, 50, 99, 100]) {
      const label = readingLabel(percent);
      assert.equal(label.toLowerCase().includes("finish"), false);
      assert.equal(label.toLowerCase().includes("complete"), false);
    }
  });
});

describe("progressLabel", () => {
  it("writes the shortest honest words for a row", () => {
    assert.equal(progressLabel({ percent: 100, isComplete: true }), "Finished");
    assert.equal(progressLabel({ percent: 0, isComplete: false }), "Not started");
    assert.equal(progressLabel({ percent: null, isComplete: false }), "Not started");
    assert.equal(progressLabel({ percent: 42, isComplete: false }), "42% done");
  });
});