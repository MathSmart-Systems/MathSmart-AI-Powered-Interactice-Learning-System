import { Suspense } from "react";

import { QuestionBankSkeleton, QuestionBankView } from "@/modules/teacher-admin/question-bank";

export const metadata = { title: "Question Bank | MathSmart" };

/**
 * Renders the Question Bank route with a loading fallback for its server data.
 *
 * The boundary deliberately carries no `key`. Keying it on the query string
 * made every tab, filter, search and page change a fresh boundary, so React
 * threw the rendered list away and showed the whole skeleton again — the rows
 * a teacher was reading vanished for the length of a round trip on every
 * ordinary control. Without a key the boundary is reused: the previous results
 * stay on screen while the new ones are fetched, and the skeleton is what it
 * was meant to be, the first paint when there is nothing to show yet.
 */
export default async function TeacherQuestionBankPage({ searchParams }) {
  const params = await searchParams;

  return (
    <Suspense fallback={<QuestionBankSkeleton />}>
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
