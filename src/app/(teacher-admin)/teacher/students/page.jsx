import { readStudentsData, StudentsView } from "@/modules/teacher-admin/students";

export const metadata = { title: "Students | MathSmart" };

export const dynamic = "force-dynamic";

export default async function TeacherStudentsPage() {
  const { learners, grades, sections, rosterTruncated, error } = await readStudentsData();

  return (
    <StudentsView
      initialLearners={learners}
      initialGrades={grades}
      initialSections={sections}
      initialError={error}
      initialTruncated={rosterTruncated}
    />
  );
}