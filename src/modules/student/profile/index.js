/**
 * Public surface of the learner profile feature.
 *
 * The route renders `StudentProfile` inside a `<Suspense>` boundary with
 * `ProfileSkeleton` as its fallback. Everything else in this directory — the
 * view, the dialogs, the API reads and the model — is private to the feature
 * and must not be imported from outside it.
 */
export { ProfileSkeleton } from "./components/ProfileSkeleton";
export { StudentProfile } from "./components/StudentProfile";