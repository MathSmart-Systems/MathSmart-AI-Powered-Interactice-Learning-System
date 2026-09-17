import { readReportsData, ReportsAnalyticsView } from "@/modules/teacher-admin/reports-analytics";

export const metadata = { title: "Reports and Analytics | MathSmart" };

export const dynamic = "force-dynamic";

const REPORTS_ERROR_MESSAGES = {
  unconfigured: "Reports and analytics are not configured for this deployment. Contact your administrator.",
  session: "Your session could not be verified. Sign in again and retry.",
  unavailable: "Reports and analytics are temporarily unavailable. Please try again.",
};

function reportsErrorMessage(error) {
  if (!error) return undefined;
  return REPORTS_ERROR_MESSAGES[error] ?? "Could not load report data. Please try again.";
}

export default async function TeacherReportsAnalyticsPage() {
  const { dashboard, analytics, sections, error } = await readReportsData();

  return (
    <ReportsAnalyticsView
      initialDashboard={dashboard}
      initialAnalytics={analytics}
      initialSections={sections}
      initialError={reportsErrorMessage(error)}
    />
  );
}
