import { WorkspacePlaceholder } from "@/modules/shared";
import { TEACHER_ADMIN_WORKSPACE } from "@/modules/teacher-admin";

export const metadata = { title: "Dashboard | MathSmart" };

export default function TeacherDashboardPage() {
  return (
    <WorkspacePlaceholder title="Dashboard" workspaceName={TEACHER_ADMIN_WORKSPACE.name} />
  );
}
