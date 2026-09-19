/**
 * Public surface of the Teacher/Administrator Students workspace.
 *
 * The server component reads the initial roster and directory state and hands
 * it to `StudentsView`, which owns the filters, the interactive roster and the
 * enrollment/edit dialogs. API helpers and server-side reads stay private to
 * this module.
 */
export { StudentDetail } from "./components/StudentDetail";
export { Students } from "./components/Students";
export { StudentDetailSkeleton } from "./components/StudentDetailSkeleton";
export { StudentDetailView } from "./components/StudentDetailView";
export { StudentsSkeleton } from "./components/StudentsSkeleton";
export { StudentsView } from "./components/StudentsView";
export { readStudentsData } from "./services/students-data";