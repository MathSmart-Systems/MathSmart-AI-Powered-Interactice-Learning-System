/**
 * Test accounts come only from the environment. The suite never invents
 * credentials and never bypasses authentication: role-dependent specs are
 * skipped when the environment does not supply an account.
 */
export const STUDENT_ACCOUNT = {
  email: process.env.E2E_STUDENT_EMAIL,
  password: process.env.E2E_STUDENT_PASSWORD,
};

export const TEACHER_ADMIN_ACCOUNT = {
  email: process.env.E2E_TEACHER_ADMIN_EMAIL,
  password: process.env.E2E_TEACHER_ADMIN_PASSWORD,
};

export function hasAccount(account) {
  return Boolean(account.email && account.password);
}

export async function signIn(page, account) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export const STUDENT_ROUTES = [
  "/student/dashboard",
  "/student/my-learning",
  "/student/activities",
  "/student/assessments",
  "/student/assessments/diagnostic",
  "/student/progress",
  "/student/profile",
];

export const TEACHER_ADMIN_ROUTES = [
  "/teacher/dashboard",
  "/teacher/students",
  "/teacher/interventions",
  "/teacher/assessments",
  "/teacher/competencies",
  "/teacher/learning-modules",
  "/teacher/activities",
  "/teacher/question-bank",
  "/teacher/grades-sections",
  "/teacher/reports-analytics",
  "/teacher/settings",
];

export const STUDENT_NAV_LABELS = [
  "Dashboard",
  "My Learning",
  "Activities",
  "Assessments",
  "Progress",
  "Profile",
];

export const TEACHER_ADMIN_NAV_LABELS = [
  "Dashboard",
  "Students",
  "Interventions",
  "Assessments",
  "Competencies",
  "Learning Modules",
  "Activities",
  "Question Bank",
  "Grades and Sections",
  "Reports and Analytics",
  "Settings",
];
