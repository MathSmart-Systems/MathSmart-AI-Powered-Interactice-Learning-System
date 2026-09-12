import { Suspense } from "react";

import { LearningModulesSkeleton, LearningModulesView } from "@/modules/teacher-admin/learning-modules";

export const metadata = { title: "Learning Modules | MathSmart" };

export default async function TeacherLearningModulesPage({ searchParams }) {
  const params = await searchParams;

  return (
    <Suspense fallback={<LearningModulesSkeleton />}>
      <LearningModulesView search={params?.search} page={params?.page} />
    </Suspense>
  );
}