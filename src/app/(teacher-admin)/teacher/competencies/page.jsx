import { Suspense } from "react";

import { Competencies, CompetenciesSkeleton } from "@/modules/teacher-admin/competencies";

export const metadata = { title: "Competencies | MathSmart" };

/** Renders the competency catalogue behind its route-level loading boundary. */
export default function TeacherCompetenciesPage() {
  return (
    <Suspense fallback={<CompetenciesSkeleton />}>
      <Competencies />
    </Suspense>
  );
}
