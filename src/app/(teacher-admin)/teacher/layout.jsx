import { ROLES } from "@/lib/auth/roles";
import { requireWorkspace } from "@/modules/auth";
import { WorkspaceShell } from "@/modules/shared";
import { TeacherAdminSidebar } from "@/modules/teacher-admin";

export const dynamic = "force-dynamic";

export default async function TeacherAdminLayout({ children }) {
  const { email } = await requireWorkspace(ROLES.TEACHER_ADMIN);

  return (
    <WorkspaceShell sidebar={<TeacherAdminSidebar email={email} />}>
      {children}
    </WorkspaceShell>
  );
}
