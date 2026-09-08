import { WorkspacePlaceholder } from "@/modules/shared";
import { STUDENT_WORKSPACE } from "@/modules/student";

export const metadata = { title: "My Learning | MathSmart" };

export default function StudentMyLearningPage() {
  return (
    <WorkspacePlaceholder title="My Learning" workspaceName={STUDENT_WORKSPACE.name} />
  );
}
