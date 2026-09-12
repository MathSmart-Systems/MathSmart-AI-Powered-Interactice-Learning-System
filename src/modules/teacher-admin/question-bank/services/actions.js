"use server";

import { revalidatePath } from "next/cache";

import {
  archiveQuestion,
  createQuestion,
  restoreQuestion,
  updateQuestion,
} from "./question-bank-api";
import {
  questionChanges,
  questionPayload,
  readQuestionForm,
  validateQuestion,
} from "../utils/question-form";

const QUESTION_BANK_PATH = "/teacher/question-bank";

function failure(formError, fieldErrors = {}) {
  return { success: false, formError, fieldErrors };
}

/**
 * Authors a question (draft or published) and refreshes the bank so the new
 * row appears on the page. Validation mirrors the API contract; anything the
 * bank refuses reaches the form as a field or form-level message.
 */
export async function createQuestionAction(_previousState, formData) {
  const values = readQuestionForm(formData);
  const fieldErrors = validateQuestion(values);

  if (Object.keys(fieldErrors).length > 0) {
    return failure("Check the highlighted fields before saving.", fieldErrors);
  }

  const result = await createQuestion(questionPayload(values));

  if (!result.ok) {
    return failure(result.message ?? "The question could not be saved.", result.fields ?? {});
  }

  revalidatePath(QUESTION_BANK_PATH);
  return { success: true, formError: null, fieldErrors: {} };
}

/**
 * Updates an existing question. The answer key and the two other write-only
 * fields are never returned by the API, so the dialog always asks the author to
 * re-enter the key. Optional fields left blank are omitted from the change and
 * keep whatever is already stored, so an unrelated edit cannot wipe the saved
 * explanation or hint.
 */
export async function updateQuestionAction(_previousState, formData) {
  const values = readQuestionForm(formData);

  if (!values.id) {
    return failure("This question could not be found. Refresh the page and try again.");
  }

  const fieldErrors = validateQuestion(values);

  if (Object.keys(fieldErrors).length > 0) {
    return failure("Check the highlighted fields before saving.", fieldErrors);
  }

  const result = await updateQuestion(values.id, questionChanges(values));

  if (!result.ok) {
    return failure(result.message ?? "The question could not be updated.", result.fields ?? {});
  }

  revalidatePath(QUESTION_BANK_PATH);
  return { success: true, formError: null, fieldErrors: {} };
}

/** Archives a question. Learner histories keep pointing at the row. */
export async function archiveQuestionAction(_previousState, formData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    return failure("This question could not be found. Refresh the page and try again.");
  }

  const result = await archiveQuestion(id);

  if (!result.ok) {
    return failure(result.message ?? "The question could not be archived.", result.fields ?? {});
  }

  revalidatePath(QUESTION_BANK_PATH);
  return { success: true, formError: null, fieldErrors: {} };
}

/**
 * Returns an archived question to draft so it can be reused.
 *
 * Unlike the dialog actions this is bound straight to a `<form action>` as a
 * plain server action, so it receives only the submitted FormData — not the
 * `(previousState, formData)` pair `useActionState` supplies.
 */
export async function restoreQuestionAction(formData) {
  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    return failure("This question could not be found. Refresh the page and try again.");
  }

  const result = await restoreQuestion(id);

  if (!result.ok) {
    return failure(result.message ?? "The question could not be restored.", result.fields ?? {});
  }

  revalidatePath(QUESTION_BANK_PATH);
  return { success: true, formError: null, fieldErrors: {} };
}