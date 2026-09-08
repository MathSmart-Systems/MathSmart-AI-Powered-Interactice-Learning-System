import { WorkspacePlaceholder } from "@/modules/shared";
import { TEACHER_ADMIN_WORKSPACE } from "@/modules/teacher-admin";

export const metadata = { title: "Competencies | MathSmart" };

export default function TeacherCompetenciesPage() {
  return (
    <WorkspacePlaceholder title="Competencies" workspaceName={TEACHER_ADMIN_WORKSPACE.name} />
  );
}
