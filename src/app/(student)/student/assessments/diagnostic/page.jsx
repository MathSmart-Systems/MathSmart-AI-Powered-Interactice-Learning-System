import {
  DiagnosticView,
  parseAttemptQuery,
} from "@/modules/student/assessments";

export const metadata = { title: "Diagnostic Assessment | MathSmart" };

export default async function StudentDiagnosticPage({ searchParams }) {
  const params = await searchParams;
  const attemptQuery = parseAttemptQuery(params?.attempt);

  return (
    <DiagnosticView
      requestedAttemptId={attemptQuery.attemptId}
      invalidAttemptLink={attemptQuery.invalid}
    />
  );
}
