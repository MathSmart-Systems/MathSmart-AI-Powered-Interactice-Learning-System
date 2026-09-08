import { WorkspacePlaceholder } from "@/modules/shared";
import { TEACHER_ADMIN_WORKSPACE } from "@/modules/teacher-admin";

export const metadata = { title: "Students | MathSmart" };

export default function TeacherStudentsPage() {
  return (
    <WorkspacePlaceholder title="Students" workspaceName={TEACHER_ADMIN_WORKSPACE.name} />
  );
}
