import { WorkspacePlaceholder } from "@/modules/shared";
import { STUDENT_WORKSPACE } from "@/modules/student";

export const metadata = { title: "Progress | MathSmart" };

export default function StudentProgressPage() {
  return (
    <WorkspacePlaceholder title="Progress" workspaceName={STUDENT_WORKSPACE.name} />
  );
}
