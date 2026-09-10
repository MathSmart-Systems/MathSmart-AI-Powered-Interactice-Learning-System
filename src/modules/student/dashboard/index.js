/**
 * Public surface of the learner dashboard feature.
 *
 * The route renders `StudentDashboard` inside a `<Suspense>` boundary with
 * `DashboardSkeleton` as its fallback. Everything else in this directory —
 * the sections, the plot, the API reads and the formatting — is private to the
 * feature and must not be imported from outside it.
 */
export { DashboardSkeleton } from "./components/DashboardSkeleton";
export { StudentDashboard } from "./components/StudentDashboard";
export { STUDENT_ROUTE } from "./utils/dashboard-model";
