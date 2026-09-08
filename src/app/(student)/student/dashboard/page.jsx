import { WorkspacePlaceholder } from "@/modules/shared";
import { STUDENT_WORKSPACE } from "@/modules/student";

export const metadata = { title: "Dashboard | MathSmart" };

export default function StudentDashboardPage() {
  return (
    <WorkspacePlaceholder title="Dashboard" workspaceName={STUDENT_WORKSPACE.name} />
  );
}
