import { WorkspacePlaceholder } from "@/modules/shared";
import { TEACHER_ADMIN_WORKSPACE } from "@/modules/teacher-admin";

export const metadata = { title: "Settings | MathSmart" };

export default function TeacherSettingsPage() {
  return (
    <WorkspacePlaceholder title="Settings" workspaceName={TEACHER_ADMIN_WORKSPACE.name} />
  );
}
