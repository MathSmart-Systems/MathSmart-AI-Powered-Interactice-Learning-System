import { Suspense } from "react";

import { ModuleSkeleton, ModuleViewer } from "@/modules/student/my-learning";

export const metadata = { title: "Lesson | MathSmart" };

export const dynamic = "force-dynamic";

export default async function StudentModulePage({ params }) {
  const { moduleId } = await params;

  return (
    <Suspense fallback={<ModuleSkeleton />}>
      <ModuleViewer moduleId={moduleId} />
    </Suspense>
  );
}