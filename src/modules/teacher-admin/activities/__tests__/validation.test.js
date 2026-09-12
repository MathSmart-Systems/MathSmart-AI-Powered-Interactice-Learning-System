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
