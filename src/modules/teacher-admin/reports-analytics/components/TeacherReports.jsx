import { readReport } from "../services/report-data.js";
import { ReportsView } from "./ReportsView.jsx";

/**
 * Reads the report for the filters the address names, then hands it over.
 * A failed read is rendered by the same view, so the filters stay on screen.
 */
export async function TeacherReports({ filters }) {
  const result = await readReport(filters);
  return (
    <ReportsView
      overview={result.overview}
      filters={filters}
      sections={result.sections}
      competencies={result.competencies}
      menusUnavailable={Boolean(result.menusUnavailable)}
      error={result.error}
    />
  );
}
