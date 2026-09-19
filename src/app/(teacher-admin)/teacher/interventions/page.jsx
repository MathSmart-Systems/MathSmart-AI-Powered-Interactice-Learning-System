import { InterventionDashboard, readInterventionsData } from "@/modules/teacher-admin/interventions";

export const metadata = { title: "Interventions | MathSmart" };

export const dynamic = "force-dynamic";

const INTERVENTIONS_ERROR_MESSAGES = {
  unconfigured: "Interventions are not configured for this deployment. Contact your administrator.",
  session: "Your session could not be verified. Sign in again and retry.",
  unavailable: "Interventions are temporarily unavailable. Please try again.",
};

function interventionsErrorMessage(error) {
  if (!error) return undefined;
  return INTERVENTIONS_ERROR_MESSAGES[error] ?? "Could not load intervention cases. Please try again.";
}

export default async function TeacherInterventionsPage() {
  const { cases, grades, sections, competencies, error } = await readInterventionsData();

  return (
    <InterventionDashboard
      initialCases={cases}
      grades={grades}
      sections={sections}
      competencies={competencies}
      initialError={interventionsErrorMessage(error)}
    />
  );
}