import { WorkspacePlaceholder } from "@/modules/shared";
import { TEACHER_ADMIN_WORKSPACE } from "@/modules/teacher-admin";

export const metadata = { title: "Assessments | MathSmart" };

export default function TeacherAssessmentsPage() {
  return (
    <WorkspacePlaceholder title="Assessments" workspaceName={TEACHER_ADMIN_WORKSPACE.name} />
  );
}
