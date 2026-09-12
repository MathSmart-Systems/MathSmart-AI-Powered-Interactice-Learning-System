/**
 * Reading and validating the author dialog form.
 *
 * The same builders back both the create and the update server actions, so the
 * two flows cannot drift apart. A question's `answer_key` is write-only by
 * column grant: it is sent with every authored payload and never read back,
 * which is why the edit form always asks for it again.
 */

import { QUESTION_TYPES } from "../constants.js";

const REQUIRED_DIFFICULTIES = ["easy", "medium", "hard"];

/**
 * The values the author dialog submits, normalised for validation and for the
 * two API payloads. Choices are only collected for multiple-choice questions;
 * the other two types take a single answer key.
 */
export function readQuestionForm(formData) {
  const choices =
    String(formData.get("question_type") ?? "").trim() === "multiple_choice"
      ? formData
          .getAll("choice")
          .map((choice) => String(choice).trim())
          .filter(Boolean)
      : [];

  return {
    id: formData.get("id") ? String(formData.get("id")) : null,
    competency_id: String(formData.get("competency_id") ?? "").trim(),
    question_type: String(formData.get("question_type") ?? "").trim(),
    difficulty: String(formData.get("difficulty") ?? "").trim(),
    prompt: String(formData.get("prompt") ?? "").trim(),
    choices,
    answer_key: String(formData.get("answer_key") ?? "").trim(),
    explanation: String(formData.get("explanation") ?? "").trim(),
    hint: String(formData.get("hint") ?? "").trim(),
    visual_aid_description: String(formData.get("visual_aid_description") ?? "").trim(),
    status: String(formData.get("status") ?? "draft").trim() === "published" ? "published" : "draft",
  };
}

/**
 * Field-level checks that mirror the API contract: required competency, a
 * supported type and difficulty, a written prompt, and a type-appropriate
 * answer key. A multiple-choice question also needs distinct choices and a key
 * that is one of them.
 */
export function validateQuestion(values) {
  const fieldErrors = {};

  if (!values.competency_id) {
    fieldErrors.competency_id = "Choose the competency this question tests.";
  }

  if (!values.question_type) {
    fieldErrors.question_type = "Choose a question type.";
  } else if (!QUESTION_TYPES.some((type) => type.value === values.question_type)) {
    fieldErrors.question_type = "That question type cannot be used yet.";
  }

  if (!REQUIRED_DIFFICULTIES.includes(values.difficulty)) {
    fieldErrors.difficulty = "Choose a difficulty.";
  }

  if (values.prompt.length < 2) {
    fieldErrors.prompt = "Write the question text.";
  }

  if (values.question_type === "multiple_choice") {
    if (values.choices.length < 2) {
      fieldErrors.choices = "A multiple-choice question needs at least two choices.";
    } else if (new Set(values.choices).size !== values.choices.length) {
      fieldErrors.choices = "Each choice must be different.";
    }

    if (!values.answer_key) {
      fieldErrors.answer_key = "Enter the correct answer.";
    } else if (values.choices.length > 0 && !values.choices.includes(values.answer_key)) {
      fieldErrors.answer_key = "The correct answer must be one of the choices.";
    }
  }

  if (values.question_type === "number_input") {
    if (!values.answer_key) {
      fieldErrors.answer_key = "Enter the correct numeric answer.";
    } else if (Number.isNaN(Number(values.answer_key))) {
      fieldErrors.answer_key = "Enter a numeric answer.";
    }
  }

  if (values.question_type === "fill_blank" && !values.answer_key) {
    fieldErrors.answer_key = "Enter the correct answer.";
  }

  return fieldErrors;
}

/**
 * The body shared by POST (create). Empty optional fields are sent as null so
 * the stored row is left without them rather than keeping a whitespace string.
 */
export function questionPayload(values) {
  return {
    competency_id: values.competency_id,
    question_type: values.question_type,
    difficulty: values.difficulty,
    prompt: values.prompt,
    choices: values.choices,
    answer_key: values.answer_key,
    explanation: values.explanation || null,
    hint: values.hint || null,
    visual_aid_description: values.visual_aid_description || null,
    status: values.status,
  };
}

/**
 * The body for PATCH (update).
 *
 * The three write-only fields can never be read back, so a blank form field on
 * edit is ambiguous: it may mean "leave the stored value alone" or "clear it".
 * Sending a blank here would wipe saved key guidance, explanation and hint
 * during an unrelated edit, which is exactly the wrong outcome. Optional fields
 * are therefore omitted when blank (the backend's update only rewrites columns
 * a request names), the answer key is always re-entered and resent because it
 * is required on every edit, and the primary fields the row is built on are
 * always rewritten.
 */
export function questionChanges(values) {
  const changes = {
    competency_id: values.competency_id,
    question_type: values.question_type,
    difficulty: values.difficulty,
    prompt: values.prompt,
    answer_key: values.answer_key,
    status: values.status,
  };

  if (values.question_type === "multiple_choice") {
    changes.choices = values.choices;
  }

  if (values.explanation) {
    changes.explanation = values.explanation;
  }

  if (values.hint) {
    changes.hint = values.hint;
  }

  if (values.visual_aid_description) {
    changes.visual_aid_description = values.visual_aid_description;
  }

  return changes;
}