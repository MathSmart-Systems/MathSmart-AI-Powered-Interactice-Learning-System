import { Suspense } from "react";

import { ProgressSkeleton, StudentProgress } from "@/modules/student/progress";

export const metadata = { title: "My Progress | MathSmart" };

export default function StudentProgressPage() {
  return (
    <Suspense fallback={<ProgressSkeleton />}>
      <StudentProgress />
    </Suspense>
  );
}
