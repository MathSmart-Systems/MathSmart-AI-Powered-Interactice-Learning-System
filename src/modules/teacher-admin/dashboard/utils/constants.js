/**
 * Constants for the Teacher/Administrator Dashboard feature.
 */

export const FIELD_IDS = Object.freeze({
  SECTION_FILTER: "teacher-dashboard-section-filter",
  REVIEW_INTERVENTIONS_BTN: "teacher-dashboard-review-interventions-btn",
  OPEN_INTERVENTIONS_LINK: "teacher-dashboard-open-interventions-link",
  VIEW_STUDENT_BTN_PREFIX: "teacher-dashboard-view-student-",
  RECORD_INTERVENTION_BTN_PREFIX: "teacher-dashboard-record-intervention-",
  RETRY_BTN: "teacher-dashboard-retry-btn",
});

export const TEACHER_ROUTES = Object.freeze({
  DASHBOARD: "/teacher/dashboard",
  STUDENTS: "/teacher/students",
  INTERVENTIONS: "/teacher/interventions",
  ASSESSMENTS: "/teacher/assessments",
  MODULES: "/teacher/learning-modules",
});

export const DASHBOARD_STATE = Object.freeze({
  READY: "ready",
  EMPTY: "empty",
  ERROR: "error",
});

export const MASTERY_THRESHOLDS = Object.freeze({
  MASTERED: 75,
  DEVELOPING: 60,
});
