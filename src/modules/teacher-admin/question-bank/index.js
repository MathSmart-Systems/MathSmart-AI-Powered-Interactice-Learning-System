/**
 * Public surface of the teacher Question Bank feature.
 *
 * The route renders `QuestionBankView` inside a `<Suspense>` boundary with
 * `QuestionBankSkeleton` as its fallback. Everything else in this directory —
 * the dialogs, the rows, the API reads and the authoring forms — is private to
 * the feature and must not be imported from outside it.
 */
export { QuestionBankSkeleton } from "./components/QuestionBankSkeleton";
export { QuestionBankView } from "./components/QuestionBankView";