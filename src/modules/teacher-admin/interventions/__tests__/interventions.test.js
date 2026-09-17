import test from "node:test";
import assert from "node:assert/strict";

import {
  formatScore,
  isReopen,
  nextStatusOptions,
  normalizeCase,
  normalizeScore,
  severityRank,
  sortCases,
  studentContextLine,
} from "../utils/intervention-helpers.js";

test("severityRank orders HIGH before MEDIUM before LOW", () => {
  assert.ok(severityRank("HIGH") < severityRank("MEDIUM"));
  assert.ok(severityRank("MEDIUM") < severityRank("LOW"));
  assert.equal(severityRank(undefined), Number.MAX_SAFE_INTEGER);
  assert.equal(severityRank(null), Number.MAX_SAFE_INTEGER);
  assert.equal(severityRank("UNKNOWN"), Number.MAX_SAFE_INTEGER);
});

test("sortCases returns a new list sorted by severity then newest first", () => {
  const cases = [
    { id: "low-old", severity: "LOW", created_at: "2026-01-01T00:00:00Z" },
    { id: "high-new", severity: "HIGH", created_at: "2026-09-01T00:00:00Z" },
    { id: "high-old", severity: "HIGH", created_at: "2026-01-10T00:00:00Z" },
    { id: "medium", severity: "MEDIUM", created_at: "2026-05-01T00:00:00Z" },
    { id: "no-severity", created_at: "2026-09-05T00:00:00Z" },
  ];

  const sorted = sortCases(cases);

  assert.notEqual(sorted, cases, "must not mutate the input list");
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["high-new", "high-old", "medium", "low-old", "no-severity"]
  );
});

test("sortCases handles empty and malformed input", () => {
  assert.deepEqual(sortCases([]), []);
  assert.deepEqual(sortCases(undefined), []);
  assert.deepEqual(sortCases(null), []);
});

test("normalizeScore accepts numbers and numeric strings", () => {
  assert.equal(normalizeScore(75), 75);
  assert.equal(normalizeScore("88.4"), 88.4);
  assert.equal(normalizeScore(0), 0);
  assert.equal(normalizeScore(100), 100);
});

test("normalizeScore returns null for missing or invalid values", () => {
  assert.equal(normalizeScore(null), null);
  assert.equal(normalizeScore(undefined), null);
  assert.equal(normalizeScore(""), null);
  assert.equal(normalizeScore("invalid"), null);
  assert.equal(normalizeScore(NaN), null);
});

test("formatScore rounds and suffixes, or renders an em dash", () => {
  assert.equal(formatScore(72.4), "72%");
  assert.equal(formatScore(88.6), "89%");
  assert.equal(formatScore(null), "—");
  assert.equal(formatScore(undefined), "—");
  assert.equal(formatScore("bad"), "—");
});

test("studentContextLine prefers grade and section together", () => {
  assert.equal(
    studentContextLine({ grade_name: "Grade 6", section_name: "Rizal" }),
    "Grade 6 – Section Rizal"
  );
  assert.equal(studentContextLine({ section_name: "Rizal" }), "Section Rizal");
  assert.equal(studentContextLine({ grade_name: "Grade 6" }), "Grade 6");
  assert.equal(studentContextLine({}), "Unassigned");
});

test("nextStatusOptions follows the documented lifecycle", () => {
  assert.deepEqual(nextStatusOptions("Needs Intervention"), ["In Progress", "Resolved"]);
  assert.deepEqual(nextStatusOptions("In Progress"), ["In Progress", "Resolved"]);
  assert.deepEqual(nextStatusOptions("Resolved"), ["In Progress"]);
  assert.deepEqual(nextStatusOptions(undefined), []);
  assert.deepEqual(nextStatusOptions("Bogus"), []);
});

test("isReopen only recognises a move back to In Progress", () => {
  assert.equal(isReopen("In Progress"), true);
  assert.equal(isReopen("Resolved"), false);
  assert.equal(isReopen(null), false);
});

test("normalizeCase keeps the documented fields and normalises evidence", () => {
  const item = {
    id: "case-1",
    student: { full_name: "Juan Dela Cruz", section_name: "Rizal" },
    competency: { code: "MATH6-INT-02", name: "Multiplication and Division of Integers" },
    severity: "HIGH",
    status: "In Progress",
    evidence: { diagnostic_score: 35, current_score: "40", unsuccessful_attempts: 2 },
    created_at: "2026-09-01T00:00:00Z",
  };

  const normalized = normalizeCase(item);

  assert.equal(normalized.id, "case-1");
  assert.equal(normalized.student.full_name, "Juan Dela Cruz");
  assert.equal(normalized.evidence.diagnostic_score, 35);
  assert.equal(normalized.evidence.current_score, 40);
  assert.equal(normalized.evidence.unsuccessful_attempts, 2);
});

test("normalizeCase degrades a malformed row to a safe shape", () => {
  assert.deepEqual(normalizeCase(null), {});
  assert.deepEqual(normalizeCase("nope"), {});

  const item = normalizeCase({ student: { full_name: "A" }, evidence: { diagnostic_score: "x" } });
  assert.equal(item.evidence.diagnostic_score, null);
  assert.equal(item.evidence.attempt_count, 0);
  assert.equal(item.student.full_name, "A");
});