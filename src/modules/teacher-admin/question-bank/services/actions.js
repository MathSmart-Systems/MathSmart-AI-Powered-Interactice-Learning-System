"use server";

import { revalidatePath } from "next/cache";

import {
  archiveQuestion,
  createQuestion,
  deleteQuestion,
  readQuestionReferences,
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

/** Creates the shared unsuccessful server-action result shape. */
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
 * The row's restore control runs this through `useActionState`, so a failure
 * reaches the row as a `formError` instead of vanishing silently. Bound
 * straight to a `<form action>` it took only the FormData and its return value
 * was discarded, which meant a refused restore left the row archived and said
 * nothing.
 */
export async function restoreQuestionAction(_previousState, formData) {
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

/**
 * The authoritative reference preview, for the delete confirmation.
 *
 * A server action rather than a browser fetch, because the bank is read on the
 * server with the caller's own token and there is no client to give one to.
 * The shape matches what the shared dialog expects from either world.
 */
export async function readQuestionReferencesAction(questionId) {
  const id = String(questionId ?? "").trim();

  if (!id) {
    return { ok: false, error: "This question could not be found." };
  }

  const result = await readQuestionReferences(id);

  if (!result.ok) {
    return { ok: false, error: result.message ?? "The references could not be read." };
  }
  return { ok: true, data: result.data };
}

/**
 * Permanently removes an archived question that was never used.
 *
 * Archiving stays the normal way to retire one, and the row's Archive action is
 * untouched. This is the other case: a prompt typed wrong, a draft abandoned, a
 * duplicate — where archiving only leaves an entry nobody can clear.
 */
export async function deleteQuestionAction(questionId) {
  const id = String(questionId ?? "").trim();

  if (!id) {
    return { ok: false, error: "This question could not be found." };
  }

  const result = await deleteQuestion(id);

  if (!result.ok) {
    return { ok: false, error: result.message ?? "That question could not be removed." };
  }

  revalidatePath(QUESTION_BANK_PATH);
  return { ok: true };
}
