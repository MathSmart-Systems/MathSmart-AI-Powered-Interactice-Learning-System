/**
 * Initial `useActionState` values for the question-bank forms. They live in a
 * plain module because a `"use server"` file may only export async functions.
 */
export const QUESTION_FORM_INITIAL_STATE = Object.freeze({
  success: false,
  formError: null,
  fieldErrors: {},
});

export const CONFIRM_ACTION_INITIAL_STATE = Object.freeze({
  success: false,
  formError: null,
  fieldErrors: {},
});

/** The two server actions a dialog can back, so the dialog can pick by mode. */
export const QUESTION_DIALOG_MODES = Object.freeze({ CREATE: "create", EDIT: "edit" });