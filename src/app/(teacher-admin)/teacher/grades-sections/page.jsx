import { GradesSectionsView, readGradesSections } from "@/modules/teacher-admin/grades-sections";

export const metadata = { title: "Grades and Sections | MathSmart" };

export const dynamic = "force-dynamic";

export default async function TeacherGradesSectionsPage() {
  const { grades, sections, advisers, error } = await readGradesSections();

  return (
    <GradesSectionsView
      initialGrades={grades}
      initialSections={sections}
      advisers={advisers}
      initialError={error}
    />
  );
}