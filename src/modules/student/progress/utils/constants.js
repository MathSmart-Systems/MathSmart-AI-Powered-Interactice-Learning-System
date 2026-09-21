/**
 * Identifiers and static configuration for the Student Progress module.
 */

export const STUDENT_ROUTE = Object.freeze({
  DASHBOARD: "/student/dashboard",
  MY_LEARNING: "/student/my-learning",
  ACTIVITIES: "/student/activities",
  ASSESSMENTS: "/student/assessments",
  PROGRESS: "/student/progress",
  DIAGNOSTIC: "/student/assessments/diagnostic",
});

export const HISTORY_TABS = Object.freeze({
  ASSESSMENTS: "assessments",
  MODULES: "modules",
  ACTIVITIES: "activities",
});

/**
 * The tab order, written once.
 *
 * Arrow-key navigation and the roving tabindex both need to know which tab sits
 * beside which, so the order lives here rather than in the order three buttons
 * happened to be typed.
 */
export const HISTORY_TAB_LIST = Object.freeze([
  Object.freeze({ value: HISTORY_TABS.ASSESSMENTS, label: "Assessments" }),
  Object.freeze({ value: HISTORY_TABS.MODULES, label: "Modules" }),
  Object.freeze({ value: HISTORY_TABS.ACTIVITIES, label: "Activities" }),
]);

export const FIELD_IDS = Object.freeze({
  TAB_ASSESSMENTS_BTN: "tab-history-assessments-btn",
  TAB_MODULES_BTN: "tab-history-modules-btn",
  TAB_ACTIVITIES_BTN: "tab-history-activities-btn",
  HISTORY_PANEL: "progress-history-panel",
  RECOMMENDED_ACTION_BTN: "progress-recommended-action-btn",
  START_DIAGNOSTIC_BTN: "progress-start-diagnostic-btn",
  RETRY_PROGRESS_BTN: "progress-retry-btn",
  COMPETENCY_TABLE: "progress-competency-table",
});

/** The button id for a history tab, so the panel can point back at its tab. */
export function historyTabId(value) {
  return `tab-history-${value}-btn`;
}
