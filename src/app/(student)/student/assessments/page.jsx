import { WorkspacePlaceholder } from "@/modules/shared";
import { STUDENT_WORKSPACE } from "@/modules/student";

export const metadata = { title: "Assessments | MathSmart" };

export default function StudentAssessmentsPage() {
  return (
    <WorkspacePlaceholder title="Assessments" workspaceName={STUDENT_WORKSPACE.name} />
  );
}
