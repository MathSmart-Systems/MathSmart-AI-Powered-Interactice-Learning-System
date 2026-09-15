/**
 * Unit tests for the competency catalogue model.
 *
 * They run on Node's own test runner (`npm run test:unit`), which is why the
 * files under test import each other with an explicit `.js` extension: it is
 * what lets this pure logic be exercised without a bundler, a browser, or a
 * dependency the project does not already have.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCompetenciesModel,
  gradeLookup,
  readableDate,
  toCompetency,
  toGrade,
} from "../utils/competencies-model.js";

import { publicationStatus } from "../utils/competency-status.js";

const GRADES = [
  { grade_id: "grade-6", name: "Grade 6", level: 6, is_active: true },
  { grade_id: "grade-5", name: "Grade 5", level: 5, is_active: true },
];

const ROW = {
  competency_id: "comp-1",
  code: "M6NS-Ia-1",
  grade_id: "grade-6",
  domain: "Numbers and Number Sense",
  name: "Describes and interprets the set of integers",
  description: "Orders integers in context.",
  status: "published",
  prerequisite_ids: ["comp-0"],
  created_at: "2026-09-10T02:00:00Z",
  updated_at: "2026-09-11T02:00:00Z",
};

describe("toGrade", () => {
  it("keeps the fields the form needs", () => {
    assert.deepEqual(toGrade(GRADES[0]), {
      id: "grade-6",
      name: "Grade 6",
      level: 6,
      isActive: true,
    });
  });

  it("degrades a missing row", () => {
    assert.deepEqual(toGrade(null), {
      id: null,
      name: null,
      level: null,
      isActive: false,
    });
  });
});

describe("gradeLookup", () => {
  it("maps a grade id to its row", () => {
    const grades = GRADES.map(toGrade);
    const lookup = gradeLookup(grades);
    assert.equal(lookup.get("grade-6").name, "Grade 6");
    assert.equal(lookup.has("grade-4"), false);
  });

  it("tolerates a missing or empty list", () => {
    assert.equal(gradeLookup(null).size, 0);
    assert.equal(gradeLookup([]).size, 0);
  });
});

describe("publicationStatus", () => {
  it("describes every state in words and a badge", () => {
    assert.equal(publicationStatus("draft").label, "Draft");
    assert.equal(publicationStatus("published").label, "Published");
    assert.equal(publicationStatus("archived").label, "Archived");
    assert.equal(publicationStatus("published").badge, "default");
    assert.equal(publicationStatus("draft").badge, "secondary");
    assert.equal(publicationStatus("archived").badge, "outline");
  });

  it("never lies about an unknown state", () => {
    const unknown = publicationStatus("exploded");
    assert.equal(unknown.label, "Unknown");
    assert.equal(unknown.badge, "outline");
    assert.ok(unknown.summary.length > 0);
  });
});

const GRADES_BY_ID = gradeLookup(GRADES.map(toGrade));

describe("toCompetency", () => {
  it("resolves the api row for display", () => {
    const item = toCompetency(ROW, GRADES_BY_ID);

    assert.equal(item.id, "comp-1");
    assert.equal(item.code, "M6NS-Ia-1");
    assert.equal(item.name, "Describes and interprets the set of integers");
    assert.equal(item.status, "published");
    assert.equal(item.statusLabel, "Published");
    assert.equal(item.gradeId, "grade-6");
    assert.equal(item.gradeName, "Grade 6");
    assert.deepEqual(item.prerequisiteIds, ["comp-0"]);
  });

  it("keeps a missing grade from crashing the card", () => {
    const item = toCompetency(ROW, gradeLookup([]));
    assert.equal(item.gradeName, null);
  });

  it("defaults a missing description to null and names the unnamed", () => {
    const item = toCompetency({ ...ROW, name: "   ", description: "" });
    assert.equal(item.name, "Untitled competency");
    assert.equal(item.description, null);
  });
});

describe("readableDate", () => {
  it("renders a readable calendar date with day, month and year", () => {
    const result = readableDate("2026-09-10T02:00:00Z");
    // Month abbreviation varies by ICU platform ("Sep" vs "Sept"), so assert
    // structural presence instead of an exact string.
    assert.ok(result.startsWith("10"), "starts with the day");
    assert.ok(result.includes("2026"), "includes the year");
    assert.ok(result.length > 8, "has a month between day and year");
  });

  it("says nothing about a missing or unreadable date", () => {
    assert.equal(readableDate(null), null);
    assert.equal(readableDate("not a date"), null);
  });
});

describe("buildCompetenciesModel", () => {
  const twoRows = [
    { ...ROW, competency_id: "z", code: "M6NS-III-9", name: "Braces the fractions" },
    { ...ROW, competency_id: "a", code: "M6NS-Ia-1", name: "Orders the integers" },
  ];

  it("builds a sorted, grade-aware catalogue", () => {
    const model = buildCompetenciesModel({
      competencies: twoRows,
      meta: { total_items: 2 },
      grades: GRADES,
      gradesUnavailable: false,
    });

    assert.equal(model.items.length, 2);
    assert.equal(model.items[0].code, "M6NS-Ia-1");
    assert.equal(model.items[0].gradeName, "Grade 6");
    assert.equal(model.isEmpty, false);
    assert.equal(model.truncated, false);
    assert.equal(model.totalCount, 2);
    assert.equal(model.grades.length, 2);
    assert.equal(model.gradesUnavailable, false);
  });

  it("recognises an empty catalogue", () => {
    const model = buildCompetenciesModel({
      competencies: [],
      grades: GRADES,
      gradesUnavailable: false,
    });

    assert.equal(model.items.length, 0);
    assert.equal(model.isEmpty, true);
    assert.equal(model.truncated, false);
  });

  it("flags a catalogue the API had to truncate", () => {
    const model = buildCompetenciesModel({
      competencies: twoRows,
      meta: { total_items: 40 },
      grades: GRADES,
      gradesUnavailable: false,
    });

    assert.equal(model.truncated, true);
    assert.equal(model.totalCount, 40);
  });

  it("keeps the grades unavailable flag for the create form", () => {
    const model = buildCompetenciesModel({
      competencies: [],
      grades: [],
      gradesUnavailable: true,
    });

    assert.equal(model.gradesUnavailable, true);
    assert.equal(model.grades.length, 0);
  });
});