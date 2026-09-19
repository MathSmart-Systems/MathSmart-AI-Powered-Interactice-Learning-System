import { Suspense } from "react";

import { StudentDetail, StudentDetailSkeleton } from "@/modules/teacher-admin/students";

export const metadata = { title: "Learner record | MathSmart" };

export const dynamic = "force-dynamic";

/** Renders one learner's record behind its route-level loading boundary. */
export default async function TeacherStudentDetailPage({ params }) {
  const { studentId } = await params;

  return (
    <Suspense fallback={<StudentDetailSkeleton />}>
      <StudentDetail studentId={studentId} />
    </Suspense>
  );
}
