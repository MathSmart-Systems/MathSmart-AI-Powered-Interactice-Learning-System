/**
 * Public surface of the student activities feature.
 *
 * The catalogue route renders `StudentActivities` inside a `<Suspense>`
 * boundary with `StudentActivitiesSkeleton` as its fallback. The player route
 * renders `ActivityPlayer` inside the same kind of boundary. Everything else in
 * this directory — the question card, feedback, progress, hooks and API reads —
 * is private to the feature and must not be imported from outside it.
 */
export { StudentActivities, StudentActivitiesSkeleton } from "./components/StudentActivities.jsx";
export { ActivityPlayer } from "./components/ActivityPlayer.jsx";
export { ActivityPlayerSkeleton } from "./components/ActivityPlayerSkeleton.jsx";