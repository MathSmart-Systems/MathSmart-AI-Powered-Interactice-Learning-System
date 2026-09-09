import { WorkspacePlaceholder } from "@/modules/shared";
import { TEACHER_ADMIN_WORKSPACE } from "@/modules/teacher-admin";

export const metadata = { title: "Activities | MathSmart" };

export default function TeacherActivitiesPage() {
  return (
    <WorkspacePlaceholder title="Activities" workspaceName={TEACHER_ADMIN_WORKSPACE.name} />
  );
}
