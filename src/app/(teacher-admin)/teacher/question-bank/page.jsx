import { Suspense } from "react";

import { QuestionBankSkeleton, QuestionBankView } from "@/modules/teacher-admin/question-bank";

export const metadata = { title: "Question Bank | MathSmart" };

export default async function TeacherQuestionBankPage({ searchParams }) {
  const params = await searchParams;

  return (
    <Suspense fallback={<QuestionBankSkeleton />}>
      <QuestionBankView search={params?.search} page={params?.page} />
    </Suspense>
  );
}