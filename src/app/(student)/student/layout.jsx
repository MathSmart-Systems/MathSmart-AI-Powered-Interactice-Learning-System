import { ROLES } from "@/lib/auth/roles";
import { requireWorkspace } from "@/modules/auth";
import { WorkspaceShell } from "@/modules/shared";
import { StudentSidebar } from "@/modules/student";

export const dynamic = "force-dynamic";

export default async function StudentLayout({ children }) {
  const { email } = await requireWorkspace(ROLES.STUDENT);

  return (
    <WorkspaceShell sidebar={<StudentSidebar email={email} />}>
      {children}
    </WorkspaceShell>
  );
}
