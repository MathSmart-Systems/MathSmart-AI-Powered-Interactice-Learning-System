import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_QUESTIONS_PER_ASSESSMENT,
  canPublishAssessment,
  characterLength,
  validateAssessmentDraft,
  validateQuestionMembership,
} from "../utils/validation.js";

const VALID_DRAFT = {
  title: "Grade 6 Diagnostic Assessment",
  grade_id: "78809ff0-cf8d-4be9-b4b3-57774780ce42",
  assessment_type: "diagnostic",
  duration_minutes: 60,
  description: "Evaluates learner foundational numeracy.",
};

describe("validateAssessmentDraft", () => {
  it("passes a complete draft", () => {
    const result = validateAssessmentDraft(VALID_DRAFT);
    assert.equal(result.isValid, true);
    assert.deepEqual(result.errors, {});
  });

  it("refuses a missing or too-short title", () => {
    assert.ok(validateAssessmentDraft({ ...VALID_DRAFT, title: "" }).errors.title);
    assert.ok(validateAssessmentDraft({ ...VALID_DRAFT, title: "A" }).errors.title);
  });

  it("handles supplementary Unicode code points correctly for title and description", () => {
    // 📐 is a supplementary character: UTF-16 .length is 2, but code point length is 1.
    assert.equal(characterLength("📐"), 1);
    assert.equal(characterLength("A📐B"), 3);

    // 1 supplementary character is 1 code point, so it should fail min length (2).
    const tooShortUni = validateAssessmentDraft({ ...VALID_DRAFT, title: "📐" });
    assert.ok(tooShortUni.errors.title);

    // 2 supplementary characters is 2 code points, so it should pass min length (2).
    const validShortUni = validateAssessmentDraft({ ...VALID_DRAFT, title: "📐📐" });
    assert.equal(validShortUni.isValid, true);

    // 300 supplementary characters (600 code units) is 300 code points, passing max length.
    const maxUni = validateAssessmentDraft({ ...VALID_DRAFT, title: "📐".repeat(300) });
    assert.equal(maxUni.isValid, true);

    // 301 supplementary characters is 301 code points, failing max length.
    const tooLongUni = validateAssessmentDraft({ ...VALID_DRAFT, title: "📐".repeat(301) });
    assert.ok(tooLongUni.errors.title);

    // Description with 4001 supplementary characters fails max description length.
    const tooLongDesc = validateAssessmentDraft({
      ...VALID_DRAFT,
      description: "📐".repeat(4001),
    });
    assert.ok(tooLongDesc.errors.description);
  });

  it("refuses a title of only whitespace", () => {
    assert.ok(validateAssessmentDraft({ ...VALID_DRAFT, title: "   " }).errors.title);
  });

  it("refuses a draft with no grade level", () => {
    assert.ok(validateAssessmentDraft({ ...VALID_DRAFT, grade_id: "" }).errors.grade_id);
  });

  it("refuses a type the data model does not hold", () => {
    // app.assessment_type is an enum, so anything else is refused by the
    // database. Saying so in the form saves a round trip and a server error.
    const result = validateAssessmentDraft({ ...VALID_DRAFT, assessment_type: "summative" });
    assert.equal(result.isValid, false);
    assert.ok(result.errors.assessment_type);
  });

  it("accepts every type the data model holds", () => {
    for (const type of ["diagnostic", "reassessment", "unit_quiz"]) {
      const result = validateAssessmentDraft({ ...VALID_DRAFT, assessment_type: type });
      assert.equal(result.isValid, true, `${type} should be accepted`);
    }
  });

  it("refuses a duration outside the table's own range", () => {
    assert.ok(validateAssessmentDraft({ ...VALID_DRAFT, duration_minutes: 0 }).errors
      .duration_minutes);
    assert.ok(validateAssessmentDraft({ ...VALID_DRAFT, duration_minutes: 500 }).errors
      .duration_minutes);
    assert.ok(validateAssessmentDraft({ ...VALID_DRAFT, duration_minutes: 45.5 }).errors
      .duration_minutes);
    assert.ok(validateAssessmentDraft({ ...VALID_DRAFT, duration_minutes: "" }).errors
      .duration_minutes);
  });

  it("accepts a duration typed into a form as a string", () => {
    const result = validateAssessmentDraft({ ...VALID_DRAFT, duration_minutes: "90" });
    assert.equal(result.isValid, true);
  });
});

describe("validateQuestionMembership", () => {
  it("accepts a list of distinct questions", () => {
    const result = validateQuestionMembership(["a", "b", "c"]);
    assert.equal(result.isValid, true);
    assert.equal(result.reason, null);
  });

  it("refuses an empty list", () => {
    // The replacement is whole-list, so saving an empty one would empty the
    // assessment, and a learner would then be scored zero on nothing.
    const result = validateQuestionMembership([]);
    assert.equal(result.isValid, false);
    assert.ok(result.reason);
  });

  it("refuses a repeated question", () => {
    const result = validateQuestionMembership(["a", "b", "a"]);
    assert.equal(result.isValid, false);
    assert.ok(result.reason.includes("only once"));
  });

  it("refuses more questions than one assessment holds", () => {
    const tooMany = Array.from(
      { length: MAX_QUESTIONS_PER_ASSESSMENT + 1 },
      (_unused, index) => `question-${index}`
    );
    assert.equal(validateQuestionMembership(tooMany).isValid, false);
  });

  it("refuses anything that is not a list", () => {
    assert.equal(validateQuestionMembership(null).isValid, false);
    assert.equal(validateQuestionMembership(undefined).isValid, false);
  });
});

describe("canPublishAssessment", () => {
  it("offers publication for a draft that holds questions", () => {
    const result = canPublishAssessment({ status: "draft" }, 5);
    assert.equal(result.canPublish, true);
    assert.equal(result.reason, null);
  });

  it("refuses a draft that holds no questions", () => {
    const result = canPublishAssessment({ status: "draft" }, 0);
    assert.equal(result.canPublish, false);
    assert.ok(result.reason.includes("at least one question"));
  });

  it("refuses an assessment that is already published", () => {
    const result = canPublishAssessment({ status: "published" }, 10);
    assert.equal(result.canPublish, false);
    assert.ok(result.reason.includes("already published"));
  });

  it("refuses an archived assessment", () => {
    const result = canPublishAssessment({ status: "archived" }, 10);
    assert.equal(result.canPublish, false);
    assert.ok(result.reason.includes("archived"));
  });

  it("refuses when there is no assessment at all", () => {
    assert.equal(canPublishAssessment(null, 10).canPublish, false);
  });
});
