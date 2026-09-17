import { readReportsData, ReportsAnalyticsView } from "@/modules/teacher-admin/reports-analytics";

export const metadata = { title: "Reports and Analytics | MathSmart" };

export const dynamic = "force-dynamic";

export default async function TeacherReportsAnalyticsPage() {
  const { dashboard, analytics, sections, error } = await readReportsData();

  return (
    <ReportsAnalyticsView
      initialDashboard={dashboard}
      initialAnalytics={analytics}
      initialSections={sections}
      initialError={error}
    />
  );
}
