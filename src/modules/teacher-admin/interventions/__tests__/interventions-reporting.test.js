import test from "node:test";
import assert from "node:assert/strict";

import {
  casesToCsv,
  inWindow,
  weekWindow,
  weeklySummary,
} from "../utils/intervention-helpers.js";

const NOW = new Date("2026-09-19T12:00:00Z");
const expectedStart = new Date(NOW);
expectedStart.setDate(expectedStart.getDate() - 6);
expectedStart.setHours(0, 0, 0, 0);
const expectedEnd = new Date(NOW);
expectedEnd.setHours(23, 59, 59, 999);

function caseRow(overrides = {}) {
  return {
    id: "case-1",
    severity: "HIGH",
    status: "Needs Intervention",
    created_at: "2026-09-16T09:00:00Z",
    resolved_at: null,
    ...overrides,
  };
}

test("weekWindow covers the trailing seven days inclusive", () => {
  const window = weekWindow(NOW);

  assert.equal(window.start.getTime(), expectedStart.getTime());
  assert.equal(window.end.getTime(), expectedEnd.getTime());
});

test("inWindow accepts boundaries and rejects outside and missing values", () => {
  const window = weekWindow(NOW);
  const daysAgo = (days) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

  assert.equal(inWindow(expectedStart.toISOString(), window), true);
  assert.equal(inWindow(expectedEnd.toISOString(), window), true);
  assert.equal(inWindow(daysAgo(8).toISOString(), window), false);
  assert.equal(inWindow(daysAgo(-1).toISOString(), window), false);
  assert.equal(inWindow(null, window), false);
  assert.equal(inWindow(undefined, window), false);
  assert.equal(inWindow("not-a-date", window), false);
});

test("weeklySummary counts opened, resolved, unresolved and high priority", () => {
  const summary = weeklySummary(
    [
      caseRow({ id: "1", severity: "HIGH", status: "Needs Intervention", created_at: "2026-09-18T08:00:00Z" }),
      caseRow({ id: "2", severity: "MEDIUM", status: "Needs Intervention", created_at: "2026-09-15T08:00:00Z" }),
      caseRow({ id: "3", severity: "LOW", status: "Resolved", created_at: "2026-09-05T08:00:00Z", resolved_at: "2026-09-17T08:00:00Z" }),
      caseRow({ id: "4", severity: "HIGH", status: "Resolved", created_at: "2026-09-10T08:00:00Z", resolved_at: "2026-09-03T08:00:00Z" }),
      caseRow({ id: "5", severity: "MEDIUM", status: "In Progress", created_at: "2026-09-06T08:00:00Z" }),
    ],
    NOW
  );

  assert.equal(summary.total, 5);
  assert.equal(summary.openedCount, 2);
  assert.deepEqual(
    summary.openedCases.map((item) => item.id),
    ["1", "2"]
  );
  assert.equal(summary.resolvedCount, 1);
  assert.deepEqual(
    summary.resolvedCases.map((item) => item.id),
    ["3"]
  );
  assert.equal(summary.unresolvedCount, 3);
  assert.equal(summary.highOpenCount, 1);
});

test("weeklySummary degrades to zeros for a missing or empty list", () => {
  assert.equal(weeklySummary(null, NOW).total, 0);
  assert.equal(weeklySummary([], NOW).openedCount, 0);
  assert.equal(weeklySummary(undefined, NOW).resolvedCount, 0);
  assert.equal(weeklySummary("nope", NOW).highOpenCount, 0);
});

test("an empty weekly export still yields a headers-only CSV", () => {
  const csv = casesToCsv([]);

  assert.ok(csv.startsWith("intervention_id,"));
  assert.equal(csv.split("\r\n").length, 1);
});