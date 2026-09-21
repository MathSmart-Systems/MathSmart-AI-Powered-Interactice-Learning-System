import { Suspense } from "react";

import {
  AssessmentPlayerSkeleton,
  DiagnosticView,
  parseAttemptQuery,
} from "@/modules/student/assessments";

export const metadata = { title: "Diagnostic Assessment | MathSmart" };

export default async function StudentDiagnosticPage({ searchParams }) {
  const params = await searchParams;
  const attemptQuery = parseAttemptQuery(params?.attempt);

  return (
    <Suspense fallback={<AssessmentPlayerSkeleton />}>
      <DiagnosticView
        requestedAttemptId={attemptQuery.attemptId}
        invalidAttemptLink={attemptQuery.invalid}
      />
    </Suspense>
  );
}
