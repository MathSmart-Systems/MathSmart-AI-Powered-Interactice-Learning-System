/**
 * Public surface of the Teacher Interventions workspace.
 *
 * Two routes live here. The queue reads its filters from the address and hands
 * them to `InterventionDashboard`, which owns the filter bar, the table and the
 * bulk actions. One case is its own page: `InterventionCase` reads it on the
 * server and `InterventionCaseView` renders the evidence, the advisory panel
 * and the record form. API helpers and the server-side reads stay private.
 */
export { InterventionCase } from "./components/InterventionCase";
export { InterventionCaseSkeleton } from "./components/InterventionCaseSkeleton";
export { InterventionDashboard } from "./components/InterventionDashboard";
export { readInterventionsData } from "./services/interventions-data";
