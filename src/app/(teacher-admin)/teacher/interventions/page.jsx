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

/**
 * The intervention queue, filtered by the address.
 *
 * The filters arrive as search params, so a queue narrowed before opening a
 * case is the queue that comes back with the teacher — and a refresh, a
 * bookmark or a shared link lands on the same rows rather than on everything.
 */
export default async function TeacherInterventionsPage({ searchParams }) {
  const query = await searchParams;
  const { cases, sections, competencies, error } = await readInterventionsData(query);

  return (
    <InterventionDashboard
      initialCases={cases}
      sections={sections}
      competencies={competencies}
      initialError={interventionsErrorMessage(error)}
    />
  );
}
