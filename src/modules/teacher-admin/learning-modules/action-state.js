/**
 * Initial `useActionState` values for the learning-module forms. They live in a
 * plain module because a `"use server"` file may only export async functions.
 */
export const MODULE_FORM_INITIAL_STATE = Object.freeze({
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
export const MODULE_DIALOG_MODES = Object.freeze({ CREATE: "create", EDIT: "edit" });