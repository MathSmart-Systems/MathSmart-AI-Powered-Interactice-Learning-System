/**
 * Public surface of the Grades & Sections workspace.
 *
 * The server component reads the initial directory state and hands it to
 * `GradesSectionsView`, which owns the interactive lists and the create/edit
 * dialogs. API helpers and the server-side reads stay private to this module.
 */
export { GradesSectionsView } from "./components/GradesSectionsView";
export { readGradesSections } from "./services/grades-sections-data";