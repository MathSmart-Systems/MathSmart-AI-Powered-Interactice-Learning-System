/**
 * Public surface of the Teacher/Administrator competency catalogue feature.
 *
 * The route renders `Competencies` inside a `<Suspense>` boundary with
 * `CompetenciesSkeleton` as its fallback. Everything else in this directory —
 * the dialogs, the cards, the API reads, the authoring actions and the model —
 * is private to the feature and must not be imported from outside it.
 */
export { Competencies } from "./components/Competencies";
export { CompetenciesSkeleton } from "./components/CompetenciesSkeleton";