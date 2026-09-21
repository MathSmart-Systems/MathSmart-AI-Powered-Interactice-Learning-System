import { Suspense } from "react";

import { InterventionCase, InterventionCaseSkeleton } from "@/modules/teacher-admin/interventions";

export const metadata = { title: "Intervention case | MathSmart" };

export const dynamic = "force-dynamic";

/**
 * One intervention case behind its route-level loading boundary.
 *
 * The boundary carries no `key`: keying it on the query string would turn
 * arriving at the form rather than the top into a fresh boundary, and replace
 * the case with its skeleton for no reason.
 */
export default async function TeacherInterventionCasePage({ params, searchParams }) {
  const { interventionId } = await params;
  const query = await searchParams;

  return (
    <Suspense fallback={<InterventionCaseSkeleton />}>
      <InterventionCase interventionId={interventionId} query={query} />
    </Suspense>
  );
}
