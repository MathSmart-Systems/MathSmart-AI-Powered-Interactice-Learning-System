/**
 * Public surface of the Grades & Sections workspace.
 *
 * `GradesSections` reads the initial directory state on the server and hands it
 * to `GradesSectionsView`, which owns the interactive lists and the create/edit
 * dialogs. `GradesSectionsSkeleton` holds the page's shape while that read is in
 * flight. API helpers and the server-side reads stay private to this module.
 */
export { GradesSections } from "./components/GradesSections";
export { GradesSectionsSkeleton } from "./components/GradesSectionsSkeleton";
export { GradesSectionsView } from "./components/GradesSectionsView";
export { readGradesSections } from "./services/grades-sections-data";
