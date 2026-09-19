import { Suspense } from "react";

import { Students, StudentsSkeleton } from "@/modules/teacher-admin/students";

export const metadata = { title: "Students | MathSmart" };

export const dynamic = "force-dynamic";

/** Renders the student roster behind its route-level loading boundary. */
export default function TeacherStudentsPage() {
  return (
    <Suspense fallback={<StudentsSkeleton />}>
      <Students />
    </Suspense>
  );
}
