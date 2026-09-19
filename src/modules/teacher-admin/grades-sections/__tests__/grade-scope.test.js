/**
 * Unit tests for the MVP curriculum scope, as the directory sees it.
 *
 * The rule these check is stated twice on purpose — here and in
 * `backend/modules/teacher_admin/grade_scope.py` — because the interface has
 * to stop offering what the API would refuse. These tests are what keep the
 * two answering the same way.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MVP_GRADE_LEVEL,
  MVP_GRADE_NAME,
  gradeNameFor,
  isMvpGrade,
  nameContradictsLevel,
  partitionDirectory,
} from "../utils/grade-scope.js";

const GRADE_6 = { grade_id: "g6", name: "Grade 6", level: 6, is_active: true };
const GRADE_3 = { grade_id: "g3", name: "Grade 3", level: 3, is_active: true };
const GRADE_1 = { grade_id: "g1", name: "grade 1", level: 1, is_active: true };

const section = (id, gradeId, name) => ({
  section_id: id,
  grade_id: gradeId,
  name,
  is_active: true,
});

describe("MVP_GRADE_LEVEL", () => {
  it("is Grade 6, the one curriculum MathSmart teaches", () => {
    assert.equal(MVP_GRADE_LEVEL, 6);
    assert.equal(MVP_GRADE_NAME, "Grade 6");
  });
});

describe("isMvpGrade", () => {
  it("recognises the supported grade", () => {
    assert.equal(isMvpGrade(GRADE_6), true);
  });

  it("refuses every other level", () => {
    assert.equal(isMvpGrade(GRADE_3), false);
    assert.equal(isMvpGrade({ level: 7 }), false);
    assert.equal(isMvpGrade({ level: 0 }), false);
  });

  it("reads a level that arrived as a string, because JSON is not typed", () => {
    assert.equal(isMvpGrade({ level: "6" }), true);
    assert.equal(isMvpGrade({ level: "3" }), false);
  });

  it("survives a missing record rather than throwing", () => {
    assert.equal(isMvpGrade(null), false);
    assert.equal(isMvpGrade(undefined), false);
    assert.equal(isMvpGrade({}), false);
  });
});

describe("nameContradictsLevel", () => {
  it("accepts a name that claims no grade at all", () => {
    assert.equal(nameContradictsLevel("Rizal", 6), false);
    assert.equal(nameContradictsLevel("Mathematics", 6), false);
  });

  it("accepts a name that claims its own level", () => {
    assert.equal(nameContradictsLevel("Grade 6", 6), false);
    assert.equal(nameContradictsLevel("grade 6", 6), false);
    assert.equal(nameContradictsLevel("Grade 6 Mathematics", 6), false);
  });

  it("refuses a name that claims a different grade", () => {
    assert.equal(nameContradictsLevel("Grade 3", 6), true);
    assert.equal(nameContradictsLevel("grade 1", 6), true);
    assert.equal(nameContradictsLevel("Grade 12", 6), true);
  });

  it("refuses a name that claims two grades at once", () => {
    assert.equal(nameContradictsLevel("Grade 5 and Grade 6", 6), true);
  });

  it("does not read a year as a grade claim", () => {
    assert.equal(nameContradictsLevel("Grade 6 (2026)", 6), false);
    assert.equal(nameContradictsLevel("2026", 6), false);
  });

  it("has nothing to contradict when the name or level is absent", () => {
    assert.equal(nameContradictsLevel("", 6), false);
    assert.equal(nameContradictsLevel("   ", 6), false);
    assert.equal(nameContradictsLevel(null, 6), false);
    assert.equal(nameContradictsLevel("Grade 3", null), false);
    assert.equal(nameContradictsLevel("Grade 3", undefined), false);
  });

  it("judges against the level it is given, not against Grade 6", () => {
    assert.equal(nameContradictsLevel("Grade 3", 3), false);
    assert.equal(nameContradictsLevel("Grade 6", 3), true);
  });
});

describe("partitionDirectory", () => {
  it("finds the supported grade and the sections under it", () => {
    const scope = partitionDirectory({
      grades: [GRADE_6],
      sections: [section("s1", "g6", "Rizal")],
    });

    assert.equal(scope.grade, GRADE_6);
    assert.equal(scope.sections.length, 1);
    assert.deepEqual(scope.outOfScopeGrades, []);
    assert.deepEqual(scope.outOfScopeSections, []);
  });

  it("sets aside a grade at another level rather than dropping it", () => {
    const scope = partitionDirectory({ grades: [GRADE_1, GRADE_3, GRADE_6], sections: [] });

    assert.equal(scope.grade, GRADE_6);
    assert.deepEqual(
      scope.outOfScopeGrades.map((grade) => grade.grade_id),
      ["g1", "g3"],
    );
  });

  it("sets aside a section that belongs to an unsupported grade", () => {
    const scope = partitionDirectory({
      grades: [GRADE_3, GRADE_6],
      sections: [section("s1", "g6", "Rizal"), section("s2", "g3", "jayrold")],
    });

    assert.deepEqual(
      scope.sections.map((entry) => entry.section_id),
      ["s1"],
    );
    assert.deepEqual(
      scope.outOfScopeSections.map((entry) => entry.section_id),
      ["s2"],
    );
  });

  it("accounts for every record it was given, exactly once", () => {
    const grades = [GRADE_1, GRADE_3, GRADE_6];
    const sections = [
      section("s1", "g6", "Rizal"),
      section("s2", "g3", "jayrold"),
      section("s3", "g1", "BEbe1"),
    ];
    const scope = partitionDirectory({ grades, sections });

    assert.equal(
      (scope.grade ? 1 : 0) + scope.outOfScopeGrades.length,
      grades.length,
      "a grade went missing between the two lists",
    );
    assert.equal(
      scope.sections.length + scope.outOfScopeSections.length,
      sections.length,
      "a section went missing between the two lists",
    );
  });

  it("treats a duplicate Grade 6 row as out of scope, so sections stay unambiguous", () => {
    const duplicate = { grade_id: "g6b", name: "Grade 6", level: 6, is_active: true };
    const scope = partitionDirectory({ grades: [GRADE_6, duplicate], sections: [] });

    assert.equal(scope.grade, GRADE_6);
    assert.deepEqual(
      scope.outOfScopeGrades.map((grade) => grade.grade_id),
      ["g6b"],
    );
  });

  it("reports no supported grade when the seeded record is missing", () => {
    const scope = partitionDirectory({
      grades: [GRADE_3],
      sections: [section("s2", "g3", "jayrold")],
    });

    assert.equal(scope.grade, null);
    assert.deepEqual(scope.sections, []);
    assert.equal(scope.outOfScopeSections.length, 1);
  });

  it("never treats an orphaned section as a Grade 6 section", () => {
    const scope = partitionDirectory({
      grades: [GRADE_6],
      sections: [section("s9", "gone", "Orphan")],
    });

    assert.deepEqual(scope.sections, []);
    assert.equal(scope.outOfScopeSections.length, 1);
  });

  it("survives a directory read that failed", () => {
    const empty = partitionDirectory();
    assert.equal(empty.grade, null);
    assert.deepEqual(empty.sections, []);
    assert.deepEqual(empty.outOfScopeGrades, []);
    assert.deepEqual(empty.outOfScopeSections, []);

    const broken = partitionDirectory({ grades: null, sections: undefined });
    assert.equal(broken.grade, null);
    assert.deepEqual(broken.sections, []);
  });
});

describe("gradeNameFor", () => {
  it("names the grade a section belongs to", () => {
    assert.equal(gradeNameFor(section("s1", "g6", "Rizal"), [GRADE_6]), "Grade 6");
  });

  it("falls back to the identifier rather than inventing Grade 6", () => {
    assert.equal(gradeNameFor(section("s1", "gone", "Orphan"), [GRADE_6]), "gone");
  });

  it("says so plainly when there is nothing to fall back to", () => {
    assert.equal(gradeNameFor({ section_id: "s1" }, [GRADE_6]), "Unknown grade");
    assert.equal(gradeNameFor(null, [GRADE_6]), "Unknown grade");
  });

  it("survives a grade list that failed to load", () => {
    assert.equal(gradeNameFor(section("s1", "g6", "Rizal"), null), "g6");
  });
});
