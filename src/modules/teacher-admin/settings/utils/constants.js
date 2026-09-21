/**
 * Teacher Administration Settings Constants.
 */

export const MIN_PASSING_THRESHOLD = 60;
export const MAX_PASSING_THRESHOLD = 90;
export const DEFAULT_PASSING_THRESHOLD = 75;

export const MIN_INTERVENTION_ATTEMPTS = 1;
export const MAX_INTERVENTION_ATTEMPTS = 5;
export const DEFAULT_INTERVENTION_ATTEMPTS = 2;

/** Groq starts off: the server treats a missing setting as off, and so does this. */
export const DEFAULT_GROQ_FEATURE_ENABLED = false;

export const SETTINGS_TABS = Object.freeze({
  CLASSROOM: "classroom",
  PROFILE: "profile",
  DISPLAY: "display",
});

export const DEFAULT_DISPLAY_PREFERENCES = Object.freeze({
  theme: "light",
  density: "comfortable",
  projectorMode: false,
});

export const FIELD_IDS = Object.freeze({
  PASSING_THRESHOLD: "teacher-settings-passing-threshold",
  INTERVENTION_ATTEMPTS: "teacher-settings-intervention-attempts",
  GROQ_TOGGLE: "teacher-settings-groq-toggle",
  SAVE_BUTTON: "save-teacher-settings-btn",
  RESTORE_DEFAULTS_BUTTON: "restore-teacher-settings-defaults-btn",
  PROJECTOR_MODE_TOGGLE: "toggle-projector-mode-btn",
  AUDIT_LOG_TOGGLE: "toggle-audit-log-btn",

  // Profile Tab
  PROFILE_NAME_INPUT: "teacher-settings-profile-name",
  PROFILE_SAVE_BUTTON: "teacher-settings-profile-save-btn",
  AVATAR_UPLOAD_INPUT: "teacher-settings-avatar-upload-input",
  AVATAR_REMOVE_BUTTON: "teacher-settings-avatar-remove-btn",
  PASSWORD_NEW_INPUT: "teacher-settings-password-new",
  PASSWORD_CONFIRM_INPUT: "teacher-settings-password-confirm",
  PASSWORD_SUBMIT_BUTTON: "teacher-settings-password-submit-btn",
  NEW_EMAIL_INPUT: "teacher-settings-new-email",

  // Display Tab
  THEME_LIGHT_BTN: "teacher-settings-theme-light-btn",
  THEME_DARK_BTN: "teacher-settings-theme-dark-btn",
  THEME_SYSTEM_BTN: "teacher-settings-theme-system-btn",
  PROJECTOR_PREFERENCE_CHECKBOX: "teacher-settings-projector-preference-toggle",
  DENSITY_COMFORTABLE_BTN: "teacher-settings-density-comfortable-btn",
  DENSITY_COMPACT_BTN: "teacher-settings-density-compact-btn",
});

export const PRESET_AVATARS = Object.freeze([
  {
    id: "preset-teal",
    title: "Chalkboard Teal",
    svg: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80' width='80' height='80'><rect width='80' height='80' rx='40' fill='%231b4d3e'/><circle cx='40' cy='32' r='14' fill='%23e0f2fe'/><path d='M20 64c0-11 9-20 20-20s20 9 20 20' fill='%23e0f2fe'/><circle cx='36' cy='30' r='2' fill='%231b4d3e'/><circle cx='44' cy='30' r='2' fill='%231b4d3e'/><path d='M38 35q2 2 4 0' stroke='%231b4d3e' stroke-width='1.5' fill='none'/></svg>",
  },
  {
    id: "preset-pine",
    title: "Pine Mathematics",
    svg: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80' width='80' height='80'><rect width='80' height='80' rx='40' fill='%23064e3b'/><circle cx='40' cy='32' r='14' fill='%23dcfce7'/><path d='M20 64c0-11 9-20 20-20s20 9 20 20' fill='%23dcfce7'/><path d='M35 28h10M40 23v10' stroke='%23064e3b' stroke-width='2' stroke-linecap='round'/><path d='M38 36q2 2 4 0' stroke='%23064e3b' stroke-width='1.5' fill='none'/></svg>",
  },
  {
    id: "preset-slate",
    title: "Navy Compass",
    svg: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80' width='80' height='80'><rect width='80' height='80' rx='40' fill='%231e293b'/><circle cx='40' cy='32' r='14' fill='%23f1f5f9'/><path d='M20 64c0-11 9-20 20-20s20 9 20 20' fill='%23f1f5f9'/><circle cx='36' cy='30' r='2' fill='%231e293b'/><circle cx='44' cy='30' r='2' fill='%231e293b'/><path d='M38 35q2 2 4 0' stroke='%231e293b' stroke-width='1.5' fill='none'/><path d='M50 20l6 6' stroke='%2338bdf8' stroke-width='2'/></svg>",
  },
  {
    id: "preset-amber",
    title: "Warm Spark",
    svg: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80' width='80' height='80'><rect width='80' height='80' rx='40' fill='%2378350f'/><circle cx='40' cy='32' r='14' fill='%23fef3c7'/><path d='M20 64c0-11 9-20 20-20s20 9 20 20' fill='%23fef3c7'/><circle cx='36' cy='30' r='2' fill='%2378350f'/><circle cx='44' cy='30' r='2' fill='%2378350f'/><path d='M38 35q2 2 4 0' stroke='%2378350f' stroke-width='1.5' fill='none'/><polygon points='40,14 42,19 47,20 43,23 44,28 40,25 36,28 37,23 33,20 38,19' fill='%23f59e0b'/></svg>",
  },
]);


