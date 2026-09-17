/**
 * Public surface of the Teacher Interventions workspace.
 *
 * The server component reads the initial queue and filter directories, then
 * hands them to `InterventionDashboard`, which owns the filters, the queue
 * table, the case review modal, and the record form. API helpers and the
 * server-side reads stay private to this module.
 */
export { InterventionDashboard } from "./components/InterventionDashboard";
export { readInterventionsData } from "./services/interventions-data";