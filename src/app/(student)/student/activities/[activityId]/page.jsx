import { Suspense } from "react";

import {
  ActivityPlayer,
  ActivityPlayerSkeleton,
} from "@/modules/student/activities";

export const metadata = { title: "Activity | MathSmart" };

export default async function StudentActivityPage({ params }) {
  const { activityId } = await params;

  return (
    <Suspense fallback={<ActivityPlayerSkeleton />}>
      <ActivityPlayer activityId={activityId} />
    </Suspense>
  );
}