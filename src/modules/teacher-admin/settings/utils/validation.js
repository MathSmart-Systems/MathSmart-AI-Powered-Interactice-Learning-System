/**
 * Validation utilities for Teacher Settings.
 */

import {
  MAX_INTERVENTION_ATTEMPTS,
  MAX_PASSING_THRESHOLD,
  MIN_INTERVENTION_ATTEMPTS,
  MIN_PASSING_THRESHOLD,
} from "./constants.js";

/**
 * Validates the draft settings form values.
 *
 * @param {object} draft
 * @param {number|string} draft.passingThreshold
 * @param {number|string} draft.autoInterventionAttempts
 * @returns {{ isValid: boolean, errors: Record<string, string> }}
 */
export function validateSettingsDraft(draft = {}) {
  const errors = {};

  const passVal = Number(draft.passingThreshold);
  if (
    draft.passingThreshold === undefined ||
    draft.passingThreshold === null ||
    draft.passingThreshold === "" ||
    Number.isNaN(passVal) ||
    !Number.isInteger(passVal)
  ) {
    errors.passingThreshold = `Passing threshold must be an integer between ${MIN_PASSING_THRESHOLD}% and ${MAX_PASSING_THRESHOLD}%.`;
  } else if (passVal < MIN_PASSING_THRESHOLD || passVal > MAX_PASSING_THRESHOLD) {
    errors.passingThreshold = `Passing threshold must be between ${MIN_PASSING_THRESHOLD}% and ${MAX_PASSING_THRESHOLD}%.`;
  }

  const attemptsVal = Number(draft.autoInterventionAttempts);
  if (
    draft.autoInterventionAttempts === undefined ||
    draft.autoInterventionAttempts === null ||
    draft.autoInterventionAttempts === "" ||
    Number.isNaN(attemptsVal) ||
    !Number.isInteger(attemptsVal)
  ) {
    errors.autoInterventionAttempts = `Intervention trigger must be an integer between ${MIN_INTERVENTION_ATTEMPTS} and ${MAX_INTERVENTION_ATTEMPTS}.`;
  } else if (attemptsVal < MIN_INTERVENTION_ATTEMPTS || attemptsVal > MAX_INTERVENTION_ATTEMPTS) {
    errors.autoInterventionAttempts = `Intervention trigger must be between ${MIN_INTERVENTION_ATTEMPTS} and ${MAX_INTERVENTION_ATTEMPTS} attempts.`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
