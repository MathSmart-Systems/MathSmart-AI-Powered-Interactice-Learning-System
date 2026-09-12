/**
 * Public surface of the Teacher/Administrator Students workspace.
 *
 * The server component reads the initial roster and directory state and hands
 * it to `StudentsView`, which owns the filters, the interactive roster and the
 * enrolment/edit dialogs. API helpers and server-side reads stay private to
 * this module.
 */
export { StudentsView } from "./components/StudentsView";
export { readStudentsData } from "./services/students-data";