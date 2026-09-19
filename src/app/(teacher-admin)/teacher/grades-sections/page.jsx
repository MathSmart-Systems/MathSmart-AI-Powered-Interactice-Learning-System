import { Suspense } from "react";

import { GradesSections, GradesSectionsSkeleton } from "@/modules/teacher-admin/grades-sections";

export const metadata = { title: "Grades and Sections | MathSmart" };

export const dynamic = "force-dynamic";

/** Renders the school directory behind its route-level loading boundary. */
export default function TeacherGradesSectionsPage() {
  return (
    <Suspense fallback={<GradesSectionsSkeleton />}>
      <GradesSections />
    </Suspense>
  );
}
