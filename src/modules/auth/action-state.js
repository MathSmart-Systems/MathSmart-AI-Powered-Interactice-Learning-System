/**
 * Initial `useActionState` values for the auth forms. These live outside the
 * `"use server"` module because an action file may only export async functions.
 */
export const SIGN_IN_INITIAL_STATE = Object.freeze({
  formError: null,
  fieldErrors: {},
});

export const SIGN_OUT_INITIAL_STATE = Object.freeze({ error: null });
