import { Suspense } from "react";

import { LearningModulesSkeleton, LearningModulesView } from "@/modules/teacher-admin/learning-modules";

export const metadata = { title: "Learning Modules | MathSmart" };

/**
 * The boundary carries no `key`, for the reason the Question Bank route
 * records: keying it on the query string turned every tab, search and page
 * change into a fresh boundary and replaced the list with its skeleton.
 */
export default async function TeacherLearningModulesPage({ searchParams }) {
  const params = await searchParams;

  return (
    <Suspense fallback={<LearningModulesSkeleton />}>
      <LearningModulesView search={params?.search} status={params?.status} page={params?.page} />
    </Suspense>
  );
}
