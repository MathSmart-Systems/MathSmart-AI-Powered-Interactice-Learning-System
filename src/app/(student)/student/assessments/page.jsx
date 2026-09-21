import { Suspense } from "react";

import { AssessmentsSkeleton, StudentAssessments } from "@/modules/student/assessments";

export const metadata = { title: "Assessments | MathSmart" };

export default function StudentAssessmentsPage() {
  return (
    <Suspense fallback={<AssessmentsSkeleton />}>
      <StudentAssessments />
    </Suspense>
  );
}
