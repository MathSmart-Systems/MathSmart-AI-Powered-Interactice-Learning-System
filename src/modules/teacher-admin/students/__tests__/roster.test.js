/**
 * Unit tests for what the roster knows about itself.
 *
 * The truncation message is the one place a number the API reported has to
 * survive unchanged into something a teacher reads, so most of these are about
 * not inferring it from the page that happened to load.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MVP_GRADE_LEVEL,
  MVP_GRADE_NAME,
  UNPLACED_GROUP_NAME,
  assignableSections,
  groupBySection,
  learnerName,
  mvpGrade,
  rosterTruncationMessage,
} from "../utils/roster.js";

const GRADE_6 = { grade_id: "g6", name: "Grade 6", level: 6, is_active: true };
const GRADE_3 = { grade_id: "g3", name: "Grade 3", level: 3, is_active: true };

const section = (id, gradeId, name, isActive = true) => ({
  section_id: id,
  grade_id: gradeId,
  name,
  is_active: isActive,
});

describe("MVP_GRADE_LEVEL", () => {
  it("is Grade 6, the one curriculum MathSmart teaches", () => {
    assert.equal(MVP_GRADE_LEVEL, 6);
    assert.equal(MVP_GRADE_NAME, "Grade 6");
  });
});

describe("mvpGrade", () => {
  it("finds the supported grade among legacy ones", () => {
    assert.equal(mvpGrade([GRADE_3, GRADE_6]), GRADE_6);
  });

  it("reads a level that arrived as a string, because JSON is not typed", () => {
    const stringy = { grade_id: "g6", name: "Grade 6", level: "6" };
    assert.equal(mvpGrade([stringy]), stringy);
  });

  it("reports nothing rather than guessing when the record is missing", () => {
    assert.equal(mvpGrade([GRADE_3]), null);
    assert.equal(mvpGrade([]), null);
    assert.equal(mvpGrade(null), null);
    assert.equal(mvpGrade(undefined), null);
  });
});

describe("assignableSections", () => {
  it("offers only the supported grade's sections", () => {
    const result = assignableSections(
      [section("s1", "g6", "Rizal"), section("s2", "g3", "jayrold")],
      GRADE_6,
    );

    assert.deepEqual(
      result.map((entry) => entry.section_id),
      ["s1"],
    );
  });

  it("leaves out a retired section, which the API would refuse anyway", () => {
    const result = assignableSections(
      [section("s1", "g6", "Rizal"), section("s2", "g6", "Retired", false)],
      GRADE_6,
    );

    assert.deepEqual(
      result.map((entry) => entry.section_id),
      ["s1"],
    );
  });

  it("orders by name so the list does not move between renders", () => {
    const result = assignableSections(
      [section("s1", "g6", "Rizal"), section("s2", "g6", "Bonifacio")],
      GRADE_6,
    );

    assert.deepEqual(
      result.map((entry) => entry.name),
      ["Bonifacio", "Rizal"],
    );
  });

  it("offers nothing when there is no supported grade to belong to", () => {
    assert.deepEqual(assignableSections([section("s1", "g6", "Rizal")], null), []);
  });

  it("survives a section list that failed to load", () => {
    assert.deepEqual(assignableSections(null, GRADE_6), []);
    assert.deepEqual(assignableSections(undefined, GRADE_6), []);
  });
});

describe("rosterTruncationMessage", () => {
  it("says nothing when the whole roster is on screen", () => {
    assert.equal(rosterTruncationMessage(12, 12), null);
    assert.equal(rosterTruncationMessage(0, 0), null);
  });

  it("names both numbers when the roster is truncated", () => {
    assert.equal(
      rosterTruncationMessage(100, 412),
      "Showing first 100 of 412 learners. Filter by section to narrow the list.",
    );
  });

  it("reports the API's total, not the size of the page it returned", () => {
    // The defect this exists for: a page of 100 out of 412 must not read as
    // "100 of 100" just because that is what arrived.
    const message = rosterTruncationMessage(100, 412);

    assert.ok(message.includes("of 412"));
    assert.ok(!message.includes("of 100"));
  });

  it("says nothing when the total is smaller than the page, which cannot mean truncated", () => {
    assert.equal(rosterTruncationMessage(100, 40), null);
  });

  it("treats a missing total as nothing to report rather than as zero learners", () => {
    assert.equal(rosterTruncationMessage(10, undefined), null);
    assert.equal(rosterTruncationMessage(10, null), null);
    assert.equal(rosterTruncationMessage(10, Number.NaN), null);
  });
});

describe("learnerName", () => {
  it("uses the learner's name", () => {
    assert.equal(learnerName({ full_name: "Juan Dela Cruz" }), "Juan Dela Cruz");
  });

  it("trims a name that arrived padded", () => {
    assert.equal(learnerName({ full_name: "  Juan Dela Cruz  " }), "Juan Dela Cruz");
  });

  it("never returns an empty string, because the name is the link text", () => {
    assert.equal(learnerName({ full_name: "   " }), "Unnamed learner");
    assert.equal(learnerName({ full_name: null }), "Unnamed learner");
    assert.equal(learnerName({}), "Unnamed learner");
    assert.equal(learnerName(null), "Unnamed learner");
  });
});

describe("groupBySection", () => {
  const sections = [
    { section_id: "sec-a", name: "Grade 6 - Mabini" },
    { section_id: "sec-b", name: "Grade 6 - Rizal" },
  ];

  it("groups the roster under the sections it belongs to", () => {
    const groups = groupBySection(
      [
        { student_id: "1", section_id: "sec-b" },
        { student_id: "2", section_id: "sec-a" },
        { student_id: "3", section_id: "sec-a" },
      ],
      sections,
    );

    assert.deepEqual(
      groups.map((group) => [group.name, group.learners.length]),
      [
        ["Grade 6 - Mabini", 2],
        ["Grade 6 - Rizal", 1],
      ],
    );
  });

  it("leaves out a section that has nobody on this page", () => {
    const groups = groupBySection([{ student_id: "1", section_id: "sec-a" }], sections);
    assert.equal(groups.length, 1);
  });

  it("puts learners with no section last, under a heading that names the fix", () => {
    const groups = groupBySection(
      [
        { student_id: "1", section_id: null },
        { student_id: "2", section_id: "sec-a" },
      ],
      sections,
    );

    assert.equal(groups.at(-1).name, UNPLACED_GROUP_NAME);
    assert.equal(groups.at(-1).sectionId, null);
  });

  it("never invents a heading from a legacy section a learner still points at", () => {
    // The defect this guards: a section from an earlier deployment appeared as
    // a Grade 6 group purely because one learner row still referenced it.
    const groups = groupBySection([{ student_id: "1", section_id: "sec-legacy" }], sections);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].name, UNPLACED_GROUP_NAME);
    assert.equal(groups[0].sectionId, null);
    // And the learner is still on the roster, which is the point.
    assert.equal(groups[0].learners.length, 1);
  });

  it("builds headings only from the sections it was given", () => {
    const groups = groupBySection(
      [
        { student_id: "1", section_id: "sec-a" },
        { student_id: "2", section_id: "sec-legacy" },
      ],
      sections,
    );

    assert.deepEqual(
      groups.map((group) => group.name),
      ["Grade 6 - Mabini", UNPLACED_GROUP_NAME],
    );
  });

  it("answers with nothing for an empty roster", () => {
    assert.deepEqual(groupBySection([], sections), []);
    assert.deepEqual(groupBySection(undefined, undefined), []);
  });
});
