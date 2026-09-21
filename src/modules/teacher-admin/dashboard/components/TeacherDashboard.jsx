import { DASHBOARD_STATE } from "../utils/constants.js";
import { readDashboardData } from "../services/dashboard-data.js";
import { TeacherDashboardView } from "./TeacherDashboardView.jsx";

/**
 * Reads the dashboard for the section the address names, then hands it over.
 *
 * An error is rendered by the same view as a success, so the header and the
 * section filter stay on screen whatever the service answered.
 *
 * @param {object} props
 * @param {string|null} [props.sectionId]
 */
export async function TeacherDashboard({ sectionId = null }) {
  const result = await readDashboardData({ sectionId });

  return (
    <TeacherDashboardView
      model={result.model}
      error={result.state === DASHBOARD_STATE.ERROR ? result.error : null}
      classesUnavailable={Boolean(result.classesUnavailable)}
    />
  );
}
