import { Suspense } from "react";

import { QuestionBankSkeleton, QuestionBankView } from "@/modules/teacher-admin/question-bank";

export const metadata = { title: "Question Bank | MathSmart" };

/** Renders the Question Bank route with a loading fallback for its server data. */
export default async function TeacherQuestionBankPage({ searchParams }) {
  const params = await searchParams;

  return (
    <Suspense
      key={new URLSearchParams(
        Object.entries(params ?? {}).map(([key, value]) => [key, String(value ?? "")]),
      ).toString()}
      fallback={<QuestionBankSkeleton />}
    >
      <QuestionBankView
        search={params?.search}
        status={params?.status}
        competency_id={params?.competency_id}
        type={params?.type}
        difficulty={params?.difficulty}
        page={params?.page}
      />
    </Suspense>
  );
}
