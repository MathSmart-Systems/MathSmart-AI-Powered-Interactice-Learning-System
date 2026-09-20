/**
 * Unit tests for activity validation rules.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_DESCRIPTION_LENGTH,
  MAX_DURATION_MINUTES,
  MAX_TITLE_LENGTH,
  MIN_DURATION_MINUTES,
  MIN_TITLE_LENGTH,
  canPublishActivity,
  characterLength,
  validateActivityDraft,
} from "../utils/validation.js";

const VALID_DRAFT = Object.freeze({
  title: "Multiplication of Integers Practice",
  module_id: "4a39d286-e93e-4e75-9644-b873fcac185c",
  estimated_minutes: 15,
  points: 100,
  mastery_threshold: 75,
  status: "draft",
  description: "Practise multiplying signed integers.",
});

describe("validateActivityDraft", () => {
  it("passes a complete valid draft", () => {
    const { isValid, errors } = validateActivityDraft(VALID_DRAFT);
    assert.equal(isValid, true);
    assert.deepEqual(errors, {});
  });

  it("accepts default and stored classroom threshold values for new activity drafts", () => {
    for (const threshold of [60, 70, 75, 80, 85, 90]) {
      const { isValid } = validateActivityDraft({
        ...VALID_DRAFT,
        mastery_threshold: threshold,
      });
      assert.equal(isValid, true, `Expected threshold ${threshold} to be valid`);
    }
  });

  it("refuses a missing or too-short title", () => {
    assert.equal(validateActivityDraft({ ...VALID_DRAFT, title: "" }).isValid, false);
    assert.equal(validateActivityDraft({ ...VALID_DRAFT, title: "A" }).isValid, false);
  });

  it("refuses a title of only whitespace", () => {
    const { isValid, errors } = validateActivityDraft({ ...VALID_DRAFT, title: "   " });
    assert.equal(isValid, false);
    assert.ok(errors.title);
  });

  it("refuses a title that exceeds maximum length", () => {
    const longTitle = "a".repeat(MAX_TITLE_LENGTH + 1);
    const { isValid, errors } = validateActivityDraft({ ...VALID_DRAFT, title: longTitle });
    assert.equal(isValid, false);
    assert.ok(errors.title);
  });

  it("handles supplementary Unicode code points correctly for title and description", () => {
    assert.equal(characterLength("🧮"), 1);
    assert.equal(characterLength("A🧮B"), 3);
    assert.equal(characterLength(null), 0);
    assert.equal(characterLength(undefined), 0);
    assert.equal(characterLength(123), 0);

    // 1 supplementary character is 1 code point, failing min length (2)
    const tooShortUni = validateActivityDraft({ ...VALID_DRAFT, title: "🧮" });
    assert.equal(tooShortUni.isValid, false);
    assert.ok(tooShortUni.errors.title);

    // 2 supplementary characters is 2 code points, passing min length (2)
    const validShortUni = validateActivityDraft({ ...VALID_DRAFT, title: "🧮🧮" });
    assert.equal(validShortUni.isValid, true);

    // 300 supplementary characters (600 UTF-16 code units) is 300 code points, passing max length
    const maxUni = validateActivityDraft({ ...VALID_DRAFT, title: "🧮".repeat(300) });
    assert.equal(maxUni.isValid, true);

    // 301 supplementary characters fails max length
    const tooLongUni = validateActivityDraft({ ...VALID_DRAFT, title: "🧮".repeat(301) });
    assert.equal(tooLongUni.isValid, false);
    assert.ok(tooLongUni.errors.title);

    // Description with 4001 supplementary characters fails max description length
    const tooLongDesc = validateActivityDraft({
      ...VALID_DRAFT,
      description: "🧮".repeat(4001),
    });
    assert.equal(tooLongDesc.isValid, false);
    assert.ok(tooLongDesc.errors.description);
  });

  it("refuses a draft with no learning module", () => {
    const { isValid, errors } = validateActivityDraft({ ...VALID_DRAFT, module_id: "" });
    assert.equal(isValid, false);
    assert.ok(errors.module_id);
  });

  it("refuses a duration outside the allowed range", () => {
    assert.equal(
      validateActivityDraft({ ...VALID_DRAFT, estimated_minutes: 0 }).isValid,
      false
    );
    assert.equal(
      validateActivityDraft({ ...VALID_DRAFT, estimated_minutes: MAX_DURATION_MINUTES + 1 }).isValid,
      false
    );
  });

  it("accepts a duration typed into a form as a string", () => {
    const { isValid } = validateActivityDraft({ ...VALID_DRAFT, estimated_minutes: "20" });
    assert.equal(isValid, true);
  });

  it("refuses negative points", () => {
    const { isValid, errors } = validateActivityDraft({ ...VALID_DRAFT, points: -10 });
    assert.equal(isValid, false);
    assert.ok(errors.points);
  });

  it("refuses an empty, whitespace, or invalid mastery threshold", () => {
    assert.equal(
      validateActivityDraft({ ...VALID_DRAFT, mastery_threshold: "" }).isValid,
      false
    );
    assert.equal(
      validateActivityDraft({ ...VALID_DRAFT, mastery_threshold: "   " }).isValid,
      false
    );
    assert.equal(
      validateActivityDraft({ ...VALID_DRAFT, mastery_threshold: null }).isValid,
      false
    );
    assert.equal(
      validateActivityDraft({ ...VALID_DRAFT, mastery_threshold: undefined }).isValid,
      false
    );
    assert.equal(
      validateActivityDraft({ ...VALID_DRAFT, mastery_threshold: 75.5 }).isValid,
      false
    );
  });

  it("refuses a mastery threshold outside 1-100", () => {
    assert.equal(
      validateActivityDraft({ ...VALID_DRAFT, mastery_threshold: 0 }).isValid,
      false
    );
    assert.equal(
      validateActivityDraft({ ...VALID_DRAFT, mastery_threshold: 101 }).isValid,
      false
    );
  });

  it("refuses a description exceeding maximum length", () => {
    const longDescription = "x".repeat(MAX_DESCRIPTION_LENGTH + 1);
    const { isValid, errors } = validateActivityDraft({
      ...VALID_DRAFT,
      description: longDescription,
    });
    assert.equal(isValid, false);
    assert.ok(errors.description);
  });

  it("refuses an unrecognised status", () => {
    const { isValid, errors } = validateActivityDraft({
      ...VALID_DRAFT,
      status: "deleted",
    });
    assert.equal(isValid, false);
    assert.ok(errors.status);
  });
});

describe("canPublishActivity", () => {
  it("refuses an activity with no questions, naming what would happen", () => {
    // Publishing used to be a value in the form's status dropdown. An activity
    // with none published fine, a learner started it, was delivered nothing,
    // and was scored zero — a zero that counts toward the intervention rule.
    const { canPublish, reason } = canPublishActivity({ status: "draft" }, 0);

    assert.equal(canPublish, false);
    assert.match(reason, /at least one question/);
  });

  it("refuses an activity that is already published", () => {
    assert.equal(canPublishActivity({ status: "published" }, 3).canPublish, false);
  });

  it("sends an archived activity through restore first", () => {
    const { canPublish, reason } = canPublishActivity({ status: "archived" }, 3);

    assert.equal(canPublish, false);
    assert.match(reason, /Restore it to a draft/);
  });

  it("refuses when no activity is selected", () => {
    assert.equal(canPublishActivity(null, 3).canPublish, false);
  });

  it("allows a draft holding questions, and leaves the rest to the server", () => {
    // The server checks that every question is published and that the module
    // and competency are published too. Predicting that here would mean
    // guessing on the learner's behalf.
    assert.deepEqual(canPublishActivity({ status: "draft" }, 1), {
      canPublish: true,
      reason: null,
    });
  });

  it("treats a missing count as none rather than as permission", () => {
    assert.equal(canPublishActivity({ status: "draft" }, undefined).canPublish, false);
  });
});
