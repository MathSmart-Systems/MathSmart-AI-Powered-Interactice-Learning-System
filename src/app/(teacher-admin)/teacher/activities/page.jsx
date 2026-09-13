import { TeacherActivitiesView } from "@/modules/teacher-admin";

export const metadata = { title: "Activities | MathSmart" };

/**
 * Server-rendered route entry point for the Teacher Activities management workspace.
 *
 * @returns {JSX.Element}
 */
export default function TeacherActivitiesPage() {
  return <TeacherActivitiesView />;
}

