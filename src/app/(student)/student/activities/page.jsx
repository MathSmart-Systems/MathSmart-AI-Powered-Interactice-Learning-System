import { WorkspacePlaceholder } from "@/modules/shared";
import { STUDENT_WORKSPACE } from "@/modules/student";

export const metadata = { title: "Activities | MathSmart" };

export default function StudentActivitiesPage() {
  return (
    <WorkspacePlaceholder title="Activities" workspaceName={STUDENT_WORKSPACE.name} />
  );
}
