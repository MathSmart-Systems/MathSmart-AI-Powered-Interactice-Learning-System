import { Suspense } from "react";

import { MyLearningScreen, MyLearningSkeleton } from "@/modules/student/my-learning";

export const metadata = { title: "My Learning | MathSmart" };

export default function StudentMyLearningPage() {
  return (
    <Suspense fallback={<MyLearningSkeleton />}>
      <MyLearningScreen />
    </Suspense>
  );
}