/**
 * Public surface of the Teacher/Administrator dashboard.
 *
 * The route reads the section from the address and hands it to
 * `TeacherDashboard`, which reads the dashboard on the server and renders it.
 * The skeleton is for the route's own loading boundary.
 */
export { DashboardSkeleton } from "./components/DashboardStates.jsx";
export { TeacherDashboard } from "./components/TeacherDashboard.jsx";
export { FIELD_IDS, TEACHER_ROUTES } from "./utils/constants.js";
