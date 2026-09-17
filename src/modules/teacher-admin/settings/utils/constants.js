/**
 * Teacher Administration Settings Constants.
 */

export const MIN_PASSING_THRESHOLD = 60;
export const MAX_PASSING_THRESHOLD = 90;
export const DEFAULT_PASSING_THRESHOLD = 75;

export const MIN_INTERVENTION_ATTEMPTS = 1;
export const MAX_INTERVENTION_ATTEMPTS = 5;
export const DEFAULT_INTERVENTION_ATTEMPTS = 2;

export const FIELD_IDS = Object.freeze({
  PASSING_THRESHOLD: "teacher-settings-passing-threshold",
  INTERVENTION_ATTEMPTS: "teacher-settings-intervention-attempts",
  GROQ_TOGGLE: "teacher-settings-groq-toggle",
  DAILY_ALERTS: "teacher-settings-daily-alerts",
  SAVE_BUTTON: "save-teacher-settings-btn",
});
