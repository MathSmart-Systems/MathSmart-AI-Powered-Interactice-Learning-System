/**
 * Client-side validation for assessment authoring.
 *
 * These mirror the constraints in `backend/modules/teacher_admin/admin_schemas.py`
 * and the CHECK constraints behind them. The server refuses the same things; the
 * point of repeating them here is to say so before a round trip, in the form.
 */

import { ASSESSMENT_TYPES } from "./format.js";

export const MAX_TITLE_LENGTH = 300;
export const MIN_TITLE_LENGTH = 2;
export const MAX_DURATION_MINUTES = 480;
export const MIN_DURATION_MINUTES = 1;
export const MAX_DESCRIPTION_LENGTH = 4000;

/** Membership size the API accepts in one replacement. */
export const MAX_QUESTIONS_PER_ASSESSMENT = 200;
export const MIN_QUESTIONS_PER_ASSESSMENT = 1;

const VALID_TYPES = new Set(ASSESSMENT_TYPES.map((type) => type.value));

/** Count Unicode code points rather than UTF-16 code units. */
export function characterLength(value) {
  return typeof value === "string" ? Array.from(value).length : 0;
}

/**
 * Validates assessment draft form values.
 *
 * @param {object} draft
 * @param {string} [draft.title]
 * @param {string} [draft.grade_id]
 * @param {string} [draft.assessment_type]
 * @param {number|string} [draft.duration_minutes]
 * @param {string} [draft.description]
 * @returns {{ isValid: boolean, errors: Record<string, string> }}
 */
export function validateAssessmentDraft(draft = {}) {
  const errors = {};

  const title = typeof draft.title === "string" ? draft.title.trim() : "";
  const titleLength = characterLength(title);
  if (!title) {
    errors.title = "Give the assessment a title.";
  } else if (titleLength < MIN_TITLE_LENGTH) {
    errors.title = `Use at least ${MIN_TITLE_LENGTH} characters.`;
  } else if (titleLength > MAX_TITLE_LENGTH) {
    errors.title = `Use at most ${MAX_TITLE_LENGTH} characters.`;
  }

  const gradeId = typeof draft.grade_id === "string" ? draft.grade_id.trim() : "";
  if (!gradeId) {
    errors.grade_id = "Choose the grade level this assessment belongs to.";
  }

  const assessmentType =
    typeof draft.assessment_type === "string" ? draft.assessment_type.trim() : "";
  if (!assessmentType) {
    errors.assessment_type = "Choose an assessment type.";
  } else if (!VALID_TYPES.has(assessmentType)) {
    // The column is an enum, so anything else is refused by the database.
    errors.assessment_type = "Choose a diagnostic, reassessment or unit quiz.";
  }

  const minutes = Number(draft.duration_minutes);
  if (
    draft.duration_minutes === "" ||
    draft.duration_minutes === null ||
    draft.duration_minutes === undefined ||
    !Number.isFinite(minutes) ||
    !Number.isInteger(minutes)
  ) {
    errors.duration_minutes = "Enter the time limit as a whole number of minutes.";
  } else if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) {
    errors.duration_minutes = `Use a time limit between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES} minutes.`;
  }

  const description = typeof draft.description === "string" ? draft.description.trim() : "";
  if (characterLength(description) > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Use at most ${MAX_DESCRIPTION_LENGTH} characters.`;
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

/**
 * Validates a proposed membership before it replaces the existing one.
 *
 * @param {string[]} questionIds
 * @returns {{ isValid: boolean, reason: string | null }}
 */
export function validateQuestionMembership(questionIds) {
  if (!Array.isArray(questionIds) || questionIds.length < MIN_QUESTIONS_PER_ASSESSMENT) {
    return {
      isValid: false,
      reason: "Add at least one question before saving the question list.",
    };
  }

  if (questionIds.length > MAX_QUESTIONS_PER_ASSESSMENT) {
    return {
      isValid: false,
      reason: `An assessment holds at most ${MAX_QUESTIONS_PER_ASSESSMENT} questions.`,
    };
  }

  if (new Set(questionIds).size !== questionIds.length) {
    return { isValid: false, reason: "A question can appear in an assessment only once." };
  }

  return { isValid: true, reason: null };
}

/**
 * Whether publication is worth offering, and why not when it is not.
 *
 * The server is the authority: it also refuses an assessment whose questions
 * are still drafts, or whose grade level is no longer active, which the browser
 * cannot see from a listing row. So this decides what to offer, and the
 * server's refusal is what decides the outcome.
 *
 * @param {object|null} assessment
 * @param {number} questionCount
 * @returns {{ canPublish: boolean, reason: string | null }}
 */
export function canPublishAssessment(assessment, questionCount = 0) {
  if (!assessment) {
    return { canPublish: false, reason: "The assessment could not be found." };
  }

  if (assessment.status === "published") {
    return { canPublish: false, reason: "This assessment is already published." };
  }

  if (assessment.status === "archived") {
    return {
      canPublish: false,
      reason: "An archived assessment cannot be published. Create a new draft instead.",
    };
  }

  const count = Number(questionCount);
  if (!Number.isFinite(count) || count < MIN_QUESTIONS_PER_ASSESSMENT) {
    return {
      canPublish: false,
      reason: "Add at least one question before publishing.",
    };
  }

  return { canPublish: true, reason: null };
}
