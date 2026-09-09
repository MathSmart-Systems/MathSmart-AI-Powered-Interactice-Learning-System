import { WorkspacePlaceholder } from "@/modules/shared";
import { TEACHER_ADMIN_WORKSPACE } from "@/modules/teacher-admin";

export const metadata = { title: "Question Bank | MathSmart" };

export default function TeacherQuestionBankPage() {
  return (
    <WorkspacePlaceholder title="Question Bank" workspaceName={TEACHER_ADMIN_WORKSPACE.name} />
  );
}
