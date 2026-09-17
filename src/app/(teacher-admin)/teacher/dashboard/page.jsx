import { Suspense } from "react";

import { DashboardSkeleton, TeacherDashboard } from "@/modules/teacher-admin/dashboard";

export const metadata = { title: "Dashboard | MathSmart" };

export default function TeacherDashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <TeacherDashboard />
    </Suspense>
  );
}
