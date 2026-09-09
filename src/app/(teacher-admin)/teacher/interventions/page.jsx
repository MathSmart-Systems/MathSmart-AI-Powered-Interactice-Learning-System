import { WorkspacePlaceholder } from "@/modules/shared";
import { TEACHER_ADMIN_WORKSPACE } from "@/modules/teacher-admin";

export const metadata = { title: "Interventions | MathSmart" };

export default function TeacherInterventionsPage() {
  return (
    <WorkspacePlaceholder title="Interventions" workspaceName={TEACHER_ADMIN_WORKSPACE.name} />
  );
}
