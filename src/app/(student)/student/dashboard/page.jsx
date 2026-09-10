import { Suspense } from "react";

import { DashboardSkeleton, StudentDashboard } from "@/modules/student/dashboard";

export const metadata = { title: "Dashboard | MathSmart" };

export default function StudentDashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <StudentDashboard />
    </Suspense>
  );
}
