import { Suspense } from "react";

import { DashboardSkeleton, TeacherDashboard } from "@/modules/teacher-admin/dashboard";

export const metadata = { title: "Dashboard | MathSmart" };

/**
 * The boundary carries no `key`. Keying it on the section would turn choosing
 * one into a fresh boundary and replace the dashboard with its skeleton; left
 * unkeyed, the old section stays on screen while the new one renders.
 */
export default async function TeacherDashboardPage({ searchParams }) {
  const params = await searchParams;
  const sectionId = typeof params?.section === "string" && params.section ? params.section : null;

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <TeacherDashboard sectionId={sectionId} />
    </Suspense>
  );
}
