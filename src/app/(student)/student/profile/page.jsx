import { WorkspacePlaceholder } from "@/modules/shared";
import { STUDENT_WORKSPACE } from "@/modules/student";

export const metadata = { title: "Profile | MathSmart" };

export default function StudentProfilePage() {
  return (
    <WorkspacePlaceholder title="Profile" workspaceName={STUDENT_WORKSPACE.name} />
  );
}
