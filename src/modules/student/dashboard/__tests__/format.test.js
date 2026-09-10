/**
 * Unit tests for the dashboard's formatting.
 *
 * They run on Node's own test runner (`npm run test:unit`), which is why the
 * two files under test import each other with an explicit `.js` extension: it
 * is what lets this pure logic be exercised without a bundler, a browser, or a
 * dependency the project does not already have.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  completionPercent,
  describeGrowth,
  firstName,
  formatCount,
  formatMinutes,
  formatPoints,
  formatScore,
  formatWhen,
  greetingFor,
  toNumber,
} from "../utils/format.js";

describe("toNumber", () => {
  it("keeps finite numbers and rejects everything else", () => {
    assert.equal(toNumber(0), 0);
    assert.equal(toNumber(72.5), 72.5);
    assert.equal(toNumber(null), null);
    assert.equal(toNumber(undefined), null);
    assert.equal(toNumber("72"), null);
    assert.equal(toNumber(Number.NaN), null);
    assert.equal(toNumber(Number.POSITIVE_INFINITY), null);
  });
});

describe("formatScore", () => {
  it("renders a whole percentage", () => {
    assert.equal(formatScore(0), "0%");
    assert.equal(formatScore(72.4), "72%");
    assert.equal(formatScore(100), "100%");
  });

  it("says nothing when there is no score", () => {
    assert.equal(formatScore(null), null);
    assert.equal(formatScore(undefined), null);
  });
});

describe("formatPoints", () => {
  it("counts percentage points without a sign and pluralises", () => {
    assert.equal(formatPoints(1), "1 point");
    assert.equal(formatPoints(-1), "1 point");
    assert.equal(formatPoints(12.6), "13 points");
    assert.equal(formatPoints(null), null);
  });
});

describe("describeGrowth", () => {
  it("names the direction so an icon never carries it alone", () => {
    assert.equal(describeGrowth(18).direction, "up");
    assert.equal(describeGrowth(-4).direction, "down");
    assert.equal(describeGrowth(0).direction, "level");
    assert.equal(describeGrowth(null).direction, "unknown");
  });

  it("writes growth out in words", () => {
    assert.equal(describeGrowth(18).text, "Up 18 points since your diagnostic.");
    assert.equal(describeGrowth(-4).text, "4 points below your diagnostic so far.");
    assert.equal(describeGrowth(0).text, "Level with your diagnostic score.");
  });

  it("never blames a learner for a drop", () => {
    const wording = describeGrowth(-9).text.toLowerCase();
    for (const word of ["fail", "poor", "bad", "worse"]) {
      assert.ok(!wording.includes(word), `growth wording should not say "${word}"`);
    }
  });
});

describe("firstName", () => {
  it("takes the given name", () => {
    assert.equal(firstName("Maria Clara Santos"), "Maria");
    assert.equal(firstName("  Andres  "), "Andres");
  });

  it("returns null when there is no usable name", () => {
    assert.equal(firstName(""), null);
    assert.equal(firstName("   "), null);
    assert.equal(firstName(null), null);
    assert.equal(firstName(undefined), null);
  });
});

describe("greetingFor", () => {
  it("uses school time rather than the server's time zone", () => {
    // 01:00 UTC is 09:00 in Manila, and 23:00 UTC is 07:00 the next morning.
    assert.equal(greetingFor(new Date("2026-09-10T01:00:00Z")), "Good morning");
    assert.equal(greetingFor(new Date("2026-09-10T23:00:00Z")), "Good morning");
    assert.equal(greetingFor(new Date("2026-09-10T06:00:00Z")), "Good afternoon");
    assert.equal(greetingFor(new Date("2026-09-10T11:00:00Z")), "Good evening");
  });
});

describe("formatWhen", () => {
  const now = new Date("2026-09-10T08:00:00Z");

  it("prefers how long ago recent work was", () => {
    assert.equal(formatWhen("2026-09-10T02:00:00Z", now), "Today");
    assert.equal(formatWhen("2026-09-09T02:00:00Z", now), "Yesterday");
    assert.equal(formatWhen("2026-09-07T02:00:00Z", now), "3 days ago");
  });

  it("falls back to a date for older work", () => {
    assert.equal(formatWhen("2026-08-01T02:00:00Z", now), "1 Aug 2026");
  });

  it("says nothing about a missing or unreadable date", () => {
    assert.equal(formatWhen(null, now), null);
    assert.equal(formatWhen("not a date", now), null);
  });
});

describe("formatMinutes", () => {
  it("estimates in whole minutes", () => {
    assert.equal(formatMinutes(15), "About 15 minutes");
    assert.equal(formatMinutes(1), "About 1 minute");
  });

  it("says nothing about a missing or nonsensical estimate", () => {
    assert.equal(formatMinutes(0), null);
    assert.equal(formatMinutes(-5), null);
    assert.equal(formatMinutes(null), null);
  });
});

describe("formatCount and completionPercent", () => {
  it("counts finished against total", () => {
    assert.deepEqual(formatCount(2, 8), { finished: 2, total: 8, text: "2 of 8" });
    assert.equal(completionPercent(2, 8), 25);
  });

  it("never divides by zero", () => {
    assert.equal(completionPercent(0, 0), null);
    assert.deepEqual(formatCount(null, null), { finished: 0, total: 0, text: "0 of 0" });
  });
});
