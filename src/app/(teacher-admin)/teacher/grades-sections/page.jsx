import { WorkspacePlaceholder } from "@/modules/shared";
import { TEACHER_ADMIN_WORKSPACE } from "@/modules/teacher-admin";

export const metadata = { title: "Grades and Sections | MathSmart" };

export default function TeacherGradesSectionsPage() {
  return (
    <WorkspacePlaceholder title="Grades and Sections" workspaceName={TEACHER_ADMIN_WORKSPACE.name} />
  );
}
