import {
  DiagnosticView,
  parseAttemptQuery,
  parseAssessmentQuery,
} from "@/modules/student/assessments";

export const metadata = { title: "Diagnostic Assessment | MathSmart" };

export default async function StudentDiagnosticPage({ searchParams }) {
  const params = await searchParams;
  const attemptQuery = parseAttemptQuery(params?.attempt);
  const assessmentQuery = parseAssessmentQuery(params?.assessment);

  return (
    <DiagnosticView
      requestedAttemptId={attemptQuery.attemptId}
      requestedAssessmentId={assessmentQuery.assessmentId}
      invalidAttemptLink={attemptQuery.invalid || assessmentQuery.invalid}
    />
  );
}
