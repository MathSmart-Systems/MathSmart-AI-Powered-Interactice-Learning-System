/**
 * Teacher Administration Settings Constants.
 */

export const MIN_PASSING_THRESHOLD = 60;
export const MAX_PASSING_THRESHOLD = 90;
export const DEFAULT_PASSING_THRESHOLD = 75;

export const MIN_INTERVENTION_ATTEMPTS = 1;
export const MAX_INTERVENTION_ATTEMPTS = 5;
export const DEFAULT_INTERVENTION_ATTEMPTS = 2;

export const DEFAULT_GROQ_FEATURE_ENABLED = true;
export const DEFAULT_DAILY_ALERTS_ENABLED = true;

export const SETTINGS_TABS = Object.freeze({
  CLASSROOM: "classroom",
  PROFILE: "profile",
  DISPLAY: "display",
});

export const DEFAULT_DISPLAY_PREFERENCES = Object.freeze({
  theme: "light",
  soundEffects: true,
  density: "comfortable",
  projectorMode: false,
});

export const FIELD_IDS = Object.freeze({
  PASSING_THRESHOLD: "teacher-settings-passing-threshold",
  INTERVENTION_ATTEMPTS: "teacher-settings-intervention-attempts",
  GROQ_TOGGLE: "teacher-settings-groq-toggle",
  DAILY_ALERTS: "teacher-settings-daily-alerts",
  SAVE_BUTTON: "save-teacher-settings-btn",
  RESTORE_DEFAULTS_BUTTON: "restore-teacher-settings-defaults-btn",
  PROJECTOR_MODE_TOGGLE: "toggle-projector-mode-btn",
  AUDIT_LOG_TOGGLE: "toggle-audit-log-btn",

  // Profile Tab
  PROFILE_NAME_INPUT: "teacher-settings-profile-name",
  PROFILE_SAVE_BUTTON: "teacher-settings-profile-save-btn",
  PASSWORD_NEW_INPUT: "teacher-settings-password-new",
  PASSWORD_CONFIRM_INPUT: "teacher-settings-password-confirm",
  PASSWORD_SUBMIT_BUTTON: "teacher-settings-password-submit-btn",

  // Display Tab
  THEME_LIGHT_BTN: "teacher-settings-theme-light-btn",
  THEME_DARK_BTN: "teacher-settings-theme-dark-btn",
  THEME_SYSTEM_BTN: "teacher-settings-theme-system-btn",
  SOUND_EFFECTS_TOGGLE: "teacher-settings-sound-toggle",
  PROJECTOR_PREFERENCE_CHECKBOX: "teacher-settings-projector-preference-toggle",
  DENSITY_COMFORTABLE_BTN: "teacher-settings-density-comfortable-btn",
  DENSITY_COMPACT_BTN: "teacher-settings-density-compact-btn",
});


