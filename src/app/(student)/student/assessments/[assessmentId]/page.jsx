import { redirect } from "next/navigation";

export const metadata = { title: "Assessment | MathSmart" };

export default async function StudentAssessmentDynamicPage({ params, searchParams }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const query = resolvedSearchParams?.attempt
    ? `?attempt=${encodeURIComponent(resolvedSearchParams.attempt)}`
    : "";

  redirect(`/student/assessments/diagnostic${query}`);
}
