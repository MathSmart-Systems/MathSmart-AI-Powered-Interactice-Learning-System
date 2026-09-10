import { DASHBOARD_STATE, readDashboard } from "../services/dashboard-data";

import { DashboardView } from "./DashboardView";
import { DashboardNoProfile, DashboardServiceError } from "./DashboardUnavailable";

/**
 * Reads the signed-in learner's dashboard and renders whichever of its three
 * outcomes applies. The route wraps this in a `<Suspense>` boundary, so the
 * workspace shell and the loading shape are on screen while this awaits.
 */
export async function StudentDashboard() {
  const result = await readDashboard();

  if (result.state === DASHBOARD_STATE.NO_PROFILE) {
    return <DashboardNoProfile />;
  }

  if (result.state === DASHBOARD_STATE.ERROR) {
    return <DashboardServiceError />;
  }

  return <DashboardView model={result.model} pathUnavailable={result.pathUnavailable} />;
}
