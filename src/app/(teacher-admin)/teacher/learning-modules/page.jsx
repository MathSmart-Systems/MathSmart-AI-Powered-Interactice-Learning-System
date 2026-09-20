import { Suspense } from "react";

import { LearningModulesSkeleton, LearningModulesView } from "@/modules/teacher-admin/learning-modules";

export const metadata = { title: "Learning Modules | MathSmart" };

export default async function TeacherLearningModulesPage({ searchParams }) {
  const params = await searchParams;

  return (
    <Suspense
      // Keyed by the query, so changing a filter shows the skeleton again
      // rather than holding the previous page until the new read resolves.
      key={new URLSearchParams(
        Object.entries(params ?? {}).map(([key, value]) => [key, String(value ?? "")]),
      ).toString()}
      fallback={<LearningModulesSkeleton />}
    >
      <LearningModulesView search={params?.search} status={params?.status} page={params?.page} />
    </Suspense>
  );
}
