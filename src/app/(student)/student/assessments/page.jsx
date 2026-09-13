import { Suspense } from "react";

import {
  AssessmentHistorySkeleton,
  StudentAssessments,
} from "@/modules/student/assessments";

export const metadata = { title: "Assessments | MathSmart" };

export default function StudentAssessmentsPage() {
  return (
    <Suspense fallback={<AssessmentHistorySkeleton />}>
      <StudentAssessments />
    </Suspense>
  );
}
