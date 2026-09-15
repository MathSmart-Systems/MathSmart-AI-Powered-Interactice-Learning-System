/**
 * Public surface of the teacher Learning Modules feature.
 *
 * The route renders `LearningModulesView` inside a `<Suspense>` boundary with
 * `LearningModulesSkeleton` as its fallback. Everything else in this directory —
 * the dialogs, the rows, the API reads and the authoring forms — is private to
 * the feature and must not be imported from outside it.
 */
export { LearningModulesSkeleton } from "./components/LearningModulesSkeleton";
export { LearningModulesView } from "./components/LearningModulesView";