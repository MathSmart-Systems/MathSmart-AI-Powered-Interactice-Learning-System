import test from "node:test";
import assert from "node:assert/strict";

import {
  INTERVENTION_TEMPLATES,
  casesToCsv,
  eligibleForStatus,
  formatDate,
  formatScore,
  isReopen,
  nextStatusOptions,
  normalizeCase,
  normalizeScore,
  scoreDrop,
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

test("normalizeScore holds values inside the documented range", () => {
  assert.equal(normalizeScore(-10), 0);
  assert.equal(normalizeScore(150), 100);
  assert.equal(normalizeScore("-0.5"), 0);
  assert.equal(normalizeScore("100.5"), 100);
});

test("severityRank ignores inherited object properties", () => {
  assert.equal(severityRank("constructor"), Number.MAX_SAFE_INTEGER);
  assert.equal(severityRank("toString"), Number.MAX_SAFE_INTEGER);
  assert.equal(severityRank("hasOwnProperty"), Number.MAX_SAFE_INTEGER);
});

test("sortCases keeps a malformed severity out of the priority positions", () => {
  const sorted = sortCases([
    { id: "inherited", severity: "constructor" },
    { id: "high", severity: "HIGH" },
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ["high", "inherited"]);
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

test("nextStatusOptions offers only the lifecycle edges the database allows", () => {
  assert.deepEqual(nextStatusOptions("Needs Intervention"), ["In Progress"]);
  assert.deepEqual(nextStatusOptions("In Progress"), ["Resolved"]);
  assert.deepEqual(nextStatusOptions("Resolved"), ["In Progress"]);
  assert.deepEqual(nextStatusOptions(undefined), []);
  assert.deepEqual(nextStatusOptions("Bogus"), []);
});

test("isReopen recognises only a resolved case returning to In Progress", () => {
  assert.equal(isReopen("Resolved", "In Progress"), true);
  assert.equal(isReopen("Needs Intervention", "In Progress"), false);
  assert.equal(isReopen("In Progress", "Resolved"), false);
  assert.equal(isReopen("Resolved", "Resolved"), false);
  assert.equal(isReopen(null, "In Progress"), false);
  assert.equal(isReopen("Resolved", null), false);
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

test("scoreDrop is the diagnostic-to-current gap, floored at zero", () => {
  assert.equal(scoreDrop({ evidence: { diagnostic_score: 80, current_score: 45 } }), 35);
  assert.equal(scoreDrop({ evidence: { diagnostic_score: 60, current_score: 70 } }), 0);
  assert.equal(scoreDrop({ evidence: { diagnostic_score: 40, current_score: null } }), 0);
  assert.equal(scoreDrop({}), 0);
  assert.equal(scoreDrop(null), 0);
});

test("INTERVENTION_TEMPLATES are finite and fill the notes field", () => {
  assert.ok(INTERVENTION_TEMPLATES.length >= 3, "expected several templates");
  for (const template of INTERVENTION_TEMPLATES) {
    assert.ok(typeof template.name === "string" && template.name.length > 0);
    assert.ok(typeof template.notes === "string" && template.notes.length > 0);
  }
});

test("eligibleForStatus never silently reopens a resolved case", () => {
  const cases = [
    { id: "a", status: "Needs Intervention" },
    { id: "b", status: "In Progress" },
    { id: "c", status: "Resolved" },
  ];
  // "a" still needs to be taken up, so it cannot go straight to Resolved.
  assert.deepEqual(
    eligibleForStatus(cases, "Resolved").map((item) => item.id),
    ["b"]
  );
  assert.deepEqual(
    eligibleForStatus(cases, "In Progress").map((item) => item.id),
    ["a"]
  );
  assert.deepEqual(eligibleForStatus([], "Resolved"), []);
  assert.deepEqual(eligibleForStatus(null, "Resolved"), []);
});

test("casesToCsv writes a header and one escaped row per case", () => {
  const cases = [
    {
      id: "case-1",
      student: { id: "s-1", full_name: "Dela Cruz, Juan", learner_id: "STU-2026-001", section_name: "Rizal" },
      competency: { code: "MATH6-INT-02", name: "Integers" },
      severity: "HIGH",
      status: "In Progress",
      intervention_type: "One-on-One Remediation",
      evidence: { diagnostic_score: 35, current_score: 40, attempt_count: 3, unsuccessful_attempts: 2 },
      created_at: "2026-09-01T00:00:00Z",
      recorded_by: "Maria Santos",
    },
  ];

  const csv = casesToCsv(cases);

  const lines = csv.split("\r\n");
  assert.equal(lines[0].split(",")[0], "intervention_id");
  assert.equal(lines[1].split(",")[0], "case-1");
  assert.ok(csv.includes('"Dela Cruz, Juan"'), "commas inside a field must be quoted");
  assert.ok(csv.includes("35"));
  assert.ok(!casesToCsv(null).includes("case-1"));
});

test("casesToCsv neutralises spreadsheet formula triggers", () => {
  const cases = [
    {
      id: "case-1",
      student: { id: "s-1", full_name: "=SUM(A1:A9)", learner_id: "STU-1", section_name: "@Rizal" },
      competency: { code: "+MATH6", name: "-Integers" },
      severity: "HIGH",
      status: "In Progress",
      intervention_type: "Other",
      evidence: { diagnostic_score: 35, current_score: 30, attempt_count: 1, unsuccessful_attempts: 1 },
      created_at: "2026-09-01T00:00:00Z",
      recorded_by: "Maria Santos",
    },
  ];

  const row = casesToCsv(cases).split("\r\n")[1];

  assert.ok(row.includes("'=SUM(A1:A9)"), "a leading = must be prefixed");
  assert.ok(row.includes("'@Rizal"), "a leading @ must be prefixed");
  assert.ok(row.includes("'+MATH6"), "a leading + must be prefixed");
  assert.ok(row.includes("'-Integers"), "a leading - must be prefixed");
  assert.ok(!row.includes(",=SUM"), "no cell may still start a formula");
});

test("formatDate renders short dates or an em dash", () => {
  assert.equal(formatDate("2026-09-19T00:00:00Z").length > 0, true);
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate("not-a-date"), "—");
});