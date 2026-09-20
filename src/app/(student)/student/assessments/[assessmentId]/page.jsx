import { redirect } from "next/navigation";

export const metadata = { title: "Assessment | MathSmart" };

export default async function StudentAssessmentDynamicPage({ params, searchParams }) {
  const [{ assessmentId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const query = new URLSearchParams({ assessment: assessmentId });

  if (resolvedSearchParams?.attempt) {
    query.set("attempt", resolvedSearchParams.attempt);
  }

  redirect(`/student/assessments/diagnostic?${query.toString()}`);
}
