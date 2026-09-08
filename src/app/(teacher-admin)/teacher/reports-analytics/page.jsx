import { WorkspacePlaceholder } from "@/modules/shared";
import { TEACHER_ADMIN_WORKSPACE } from "@/modules/teacher-admin";

export const metadata = { title: "Reports and Analytics | MathSmart" };

export default function TeacherReportsAnalyticsPage() {
  return (
    <WorkspacePlaceholder title="Reports and Analytics" workspaceName={TEACHER_ADMIN_WORKSPACE.name} />
  );
}
