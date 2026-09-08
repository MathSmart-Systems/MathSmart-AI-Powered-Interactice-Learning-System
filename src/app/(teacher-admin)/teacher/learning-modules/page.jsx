import { WorkspacePlaceholder } from "@/modules/shared";
import { TEACHER_ADMIN_WORKSPACE } from "@/modules/teacher-admin";

export const metadata = { title: "Learning Modules | MathSmart" };

export default function TeacherLearningModulesPage() {
  return (
    <WorkspacePlaceholder title="Learning Modules" workspaceName={TEACHER_ADMIN_WORKSPACE.name} />
  );
}
