import { Suspense } from "react";

import {
  ReportsSkeleton,
  TeacherReports,
  readReportFilters,
} from "@/modules/teacher-admin/reports-analytics";

export const metadata = { title: "Reports and Analytics | MathSmart" };

/**
 * The boundary carries no `key`. Keying it on the filters would turn every
 * change into a fresh boundary and replace the report with its skeleton; left
 * unkeyed, the current report stays on screen while the next one renders.
 */
export default async function TeacherReportsAnalyticsPage({ searchParams }) {
  const filters = readReportFilters(await searchParams);

  return (
    <Suspense fallback={<ReportsSkeleton />}>
      <TeacherReports filters={filters} />
    </Suspense>
  );
}
