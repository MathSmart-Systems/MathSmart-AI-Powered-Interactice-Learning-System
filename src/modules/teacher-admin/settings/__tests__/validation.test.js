/**
 * Unit tests for teacher settings validation rules.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_INTERVENTION_ATTEMPTS,
  DEFAULT_PASSING_THRESHOLD,
  MAX_INTERVENTION_ATTEMPTS,
  MAX_PASSING_THRESHOLD,
  MIN_INTERVENTION_ATTEMPTS,
  MIN_PASSING_THRESHOLD,
} from "../utils/constants.js";
import { validateSettingsDraft } from "../utils/validation.js";

const VALID_DRAFT = Object.freeze({
  passingThreshold: DEFAULT_PASSING_THRESHOLD,
  autoInterventionAttempts: DEFAULT_INTERVENTION_ATTEMPTS,
});

describe("validateSettingsDraft", () => {
  it("passes a complete valid draft", () => {
    const { isValid, errors } = validateSettingsDraft(VALID_DRAFT);
    assert.equal(isValid, true);
    assert.deepEqual(errors, {});
  });

  it("accepts boundary values for passing threshold", () => {
    assert.equal(
      validateSettingsDraft({ ...VALID_DRAFT, passingThreshold: MIN_PASSING_THRESHOLD }).isValid,
      true
    );
    assert.equal(
      validateSettingsDraft({ ...VALID_DRAFT, passingThreshold: MAX_PASSING_THRESHOLD }).isValid,
      true
    );
  });

  it("accepts boundary values for auto intervention trigger", () => {
    assert.equal(
      validateSettingsDraft({ ...VALID_DRAFT, autoInterventionAttempts: MIN_INTERVENTION_ATTEMPTS })
        .isValid,
      true
    );
    assert.equal(
      validateSettingsDraft({ ...VALID_DRAFT, autoInterventionAttempts: MAX_INTERVENTION_ATTEMPTS })
        .isValid,
      true
    );
  });

  it("refuses a passing threshold below 60% or above 90%", () => {
    const low = validateSettingsDraft({ ...VALID_DRAFT, passingThreshold: 59 });
    assert.equal(low.isValid, false);
    assert.ok(low.errors.passingThreshold);

    const high = validateSettingsDraft({ ...VALID_DRAFT, passingThreshold: 91 });
    assert.equal(high.isValid, false);
    assert.ok(high.errors.passingThreshold);
  });

  it("refuses an intervention trigger below 1 or above 5", () => {
    const low = validateSettingsDraft({ ...VALID_DRAFT, autoInterventionAttempts: 0 });
    assert.equal(low.isValid, false);
    assert.ok(low.errors.autoInterventionAttempts);

    const high = validateSettingsDraft({ ...VALID_DRAFT, autoInterventionAttempts: 6 });
    assert.equal(high.isValid, false);
    assert.ok(high.errors.autoInterventionAttempts);
  });

  it("refuses missing, null, or non-integer values", () => {
    assert.equal(
      validateSettingsDraft({ ...VALID_DRAFT, passingThreshold: "" }).isValid,
      false
    );
    assert.equal(
      validateSettingsDraft({ ...VALID_DRAFT, passingThreshold: null }).isValid,
      false
    );
    assert.equal(
      validateSettingsDraft({ ...VALID_DRAFT, passingThreshold: 75.5 }).isValid,
      false
    );
    assert.equal(
      validateSettingsDraft({ ...VALID_DRAFT, autoInterventionAttempts: "abc" }).isValid,
      false
    );
  });
});
