/**
 * Constants for the Teacher/Administrator Dashboard feature.
 */

export const FIELD_IDS = Object.freeze({
  SECTION_FILTER: "teacher-dashboard-section-filter",
  OPEN_INTERVENTIONS_LINK: "teacher-dashboard-open-interventions-link",
  VIEW_STUDENT_BTN_PREFIX: "teacher-dashboard-view-student-",
  RECORD_INTERVENTION_BTN_PREFIX: "teacher-dashboard-record-intervention-",
  RETRY_BTN: "teacher-dashboard-retry-btn",
});

/**
 * Every destination the dashboard links to.
 *
 * Deep links are functions rather than query strings on a list page. The
 * version this replaced sent "View student" to `/teacher/students?student_id=`,
 * which the roster never read, so every learner opened the whole roster.
 */
export const TEACHER_ROUTES = Object.freeze({
  DASHBOARD: "/teacher/dashboard",
  STUDENTS: "/teacher/students",
  INTERVENTIONS: "/teacher/interventions",
  ASSESSMENTS: "/teacher/assessments",
  SECTIONS: "/teacher/grades-sections",
  REPORTS: "/teacher/reports-analytics",
  student: (studentId) => `/teacher/students/${encodeURIComponent(studentId)}`,
  learnerCases: (studentId) =>
    `/teacher/interventions?student=${encodeURIComponent(studentId)}`,
});

export const DASHBOARD_STATE = Object.freeze({
  READY: "ready",
  ERROR: "error",
});

/** How many learners and competencies the dashboard shows before "View all". */
export const PREVIEW = Object.freeze({
  PRIORITY_LEARNERS: 6,
  COMPETENCIES: 8,
});
