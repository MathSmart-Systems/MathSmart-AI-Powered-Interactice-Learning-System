import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ASSESSMENT_TYPES,
  formatAssessmentStatus,
  formatAssessmentType,
  formatDate,
  formatDuration,
  formatQuestionCount,
} from "../utils/format.js";

describe("formatDuration", () => {
  it("formats minutes under an hour", () => {
    assert.equal(formatDuration(1), "1 min");
    assert.equal(formatDuration(45), "45 mins");
  });

  it("formats exact hours", () => {
    assert.equal(formatDuration(60), "1 hr");
    assert.equal(formatDuration(120), "2 hrs");
  });

  it("formats hours and minutes combined", () => {
    assert.equal(formatDuration(75), "1 hr 15 mins");
    assert.equal(formatDuration(61), "1 hr 1 min");
    assert.equal(formatDuration(150), "2 hrs 30 mins");
  });

  it("formats a duration that arrived as a string", () => {
    // JSON numbers survive the API, but a form field is a string and the same
    // value should not read as missing once it passes through one.
    assert.equal(formatDuration("60"), "1 hr");
  });

  it("has nothing to show for a missing or impossible duration", () => {
    assert.equal(formatDuration(0), "—");
    assert.equal(formatDuration(-10), "—");
    assert.equal(formatDuration(null), "—");
    assert.equal(formatDuration(undefined), "—");
    assert.equal(formatDuration("soon"), "—");
  });
});

describe("formatAssessmentStatus", () => {
  it("names a Badge variant rather than a colour", () => {
    // The theme owns the colour. A status helper that returned Tailwind palette
    // classes would put one screen's palette outside the theme tokens.
    for (const status of ["draft", "published", "archived"]) {
      const formatted = formatAssessmentStatus(status);
      assert.ok(["default", "secondary", "outline"].includes(formatted.tone));
      assert.equal(typeof formatted.icon, "string");
      assert.ok(formatted.icon.length > 0);
    }
  });

  it("carries a shape for every state, so colour is never the only signal", () => {
    const icons = ["draft", "published", "archived"].map(
      (status) => formatAssessmentStatus(status).icon
    );
    assert.equal(new Set(icons).size, 3);
  });

  it("labels each publication state", () => {
    assert.equal(formatAssessmentStatus("draft").label, "Draft");
    assert.equal(formatAssessmentStatus("published").label, "Published");
    assert.equal(formatAssessmentStatus("archived").label, "Archived");
  });

  it("reads an unknown or missing status as a draft", () => {
    assert.equal(formatAssessmentStatus(null).label, "Draft");
    assert.equal(formatAssessmentStatus("").value, "draft");
    assert.equal(formatAssessmentStatus("PUBLISHED").value, "published");
  });
});

describe("formatAssessmentType", () => {
  it("labels every type the data model holds", () => {
    assert.equal(ASSESSMENT_TYPES.length, 3);
    assert.equal(formatAssessmentType("diagnostic"), "Diagnostic");
    assert.equal(formatAssessmentType("reassessment"), "Reassessment");
    assert.equal(formatAssessmentType("unit_quiz"), "Unit quiz");
  });

  it("shows an unrecognised type as it came", () => {
    // Renaming it to a known type would hide a data problem behind a plausible
    // label, and the enum makes such a value a defect worth seeing.
    assert.equal(formatAssessmentType("summative"), "summative");
  });

  it("has nothing to show for a missing type", () => {
    assert.equal(formatAssessmentType(""), "—");
    assert.equal(formatAssessmentType(null), "—");
  });
});

describe("formatQuestionCount", () => {
  it("counts questions, and says so when there are none", () => {
    assert.equal(formatQuestionCount(0), "No questions");
    assert.equal(formatQuestionCount(1), "1 question");
    assert.equal(formatQuestionCount(12), "12 questions");
    assert.equal(formatQuestionCount(null), "No questions");
  });
});

describe("formatDate", () => {
  it("formats a timestamp day-first", () => {
    assert.equal(formatDate("2026-09-12T00:00:00Z"), "12 Sep 2026");
  });

  it("resolves the date in the school's own time zone", () => {
    // 23:30 in Manila is 15:30 UTC the same day. Formatting in UTC would be
    // right, and formatting in the viewer's zone would read as the day before
    // for anyone west of the Philippines.
    assert.equal(formatDate("2026-09-12T15:30:00Z"), "12 Sep 2026");
  });

  it("has nothing to show for a missing or unreadable date", () => {
    assert.equal(formatDate(null), "—");
    assert.equal(formatDate("not-a-date"), "—");
  });
});
