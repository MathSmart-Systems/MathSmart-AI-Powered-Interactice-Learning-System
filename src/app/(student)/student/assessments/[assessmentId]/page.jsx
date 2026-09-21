import { Suspense } from "react";

import {
  AssessmentPlayerSkeleton,
  DiagnosticView,
  parseAttemptQuery,
} from "@/modules/student/assessments";

export const metadata = { title: "Assessment | MathSmart" };

/**
 * Sitting one named assessment.
 *
 * This route used to redirect every identifier to the diagnostic, which made
 * the dynamic segment decorative: a published unit quiz had a card, a link and
 * a URL, and all three arrived at the same diagnostic. It now plays the paper
 * it was asked for.
 *
 * Whether the learner may sit it is not decided here. The API refuses a paper
 * outside their year group with a 404 and an unauthorised retake with a 403,
 * so typing an identifier into the address bar reaches the same refusal as
 * pressing a button would.
 */
export default async function StudentAssessmentPage({ params, searchParams }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const attemptQuery = parseAttemptQuery(resolvedSearchParams?.attempt);

  return (
    <Suspense fallback={<AssessmentPlayerSkeleton />}>
      <DiagnosticView
        assessmentId={resolvedParams?.assessmentId ?? null}
        requestedAttemptId={attemptQuery.attemptId}
        invalidAttemptLink={attemptQuery.invalid}
      />
    </Suspense>
  );
}
