import { Suspense } from "react";

import {
  StudentActivities,
  StudentActivitiesSkeleton,
} from "@/modules/student/activities";

export const metadata = { title: "Activities | MathSmart" };

export default function StudentActivitiesPage() {
  return (
    <Suspense fallback={<StudentActivitiesSkeleton />}>
      <StudentActivities />
    </Suspense>
  );
}