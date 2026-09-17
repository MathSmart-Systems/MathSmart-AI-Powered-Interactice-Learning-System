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
  completionSentence,
  formatMinutes,
  formatPercent,
  progressLabel,
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

describe("completionSentence", () => {
  it("finishes a complete lesson plainly", () => {
    assert.equal(completionSentence({ percent: 100, isComplete: true }), "You have finished this lesson.");
  });

  it("refuses to print a fake zero for a lesson never started", () => {
    assert.equal(completionSentence({ percent: 0, isComplete: false }), "You have not started this lesson yet.");
    assert.equal(completionSentence({ percent: null, isComplete: false }), "You have not started this lesson yet.");
  });

  it("reports a real number once work exists", () => {
    assert.equal(completionSentence({ percent: 42, isComplete: false }), "42% of this lesson is complete.");
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