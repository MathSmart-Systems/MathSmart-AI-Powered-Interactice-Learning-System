import { TeacherAssessmentsView } from "@/modules/teacher-admin";

export const metadata = { title: "Assessments | MathSmart" };

/**
 * Server-rendered route entry point for the Teacher Assessments workspace.
 *
 * @returns {JSX.Element}
 */
export default function TeacherAssessmentsPage() {
  return <TeacherAssessmentsView />;
}

