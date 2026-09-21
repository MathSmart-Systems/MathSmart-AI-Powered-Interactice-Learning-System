import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CASE_ERROR, readInterventionCase } from "../services/intervention-case-data";
import { filtersFromQuery, queueHref } from "../utils/intervention-helpers";
import { InterventionCaseView } from "./InterventionCaseView";

/** What to say when the case cannot be shown, and why. */
const REASONS = {
  [CASE_ERROR.NOT_FOUND]: {
    title: "No such case",
    body: "This intervention case does not exist, or it is not one you can open. Check the queue for the case you meant.",
  },
  [CASE_ERROR.FORBIDDEN]: {
    title: "Not available to this account",
    body: "Intervention cases are available to Teacher/Administrator accounts.",
  },
  [CASE_ERROR.SESSION]: {
    title: "Your session has ended",
    body: "Sign in again to open an intervention case.",
  },
  [CASE_ERROR.UNCONFIGURED]: {
    title: "The intervention service is not configured",
    body: "The MathSmart API address is missing from this deployment, so cases cannot be read.",
  },
  [CASE_ERROR.UNAVAILABLE]: {
    title: "The case could not be read",
    body: "The service did not answer. Reload the page to try again.",
  },
};

function Unavailable({ reason, backHref }) {
  const { title, body } = REASONS[reason] ?? REASONS[CASE_ERROR.UNAVAILABLE];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-2 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to the intervention queue
      </Link>

      <div className="max-w-prose rounded-lg border border-border bg-secondary/40 px-4 py-5">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

/**
 * Reads one intervention case and renders whichever outcome applies.
 *
 * The route wraps this in a `<Suspense>` boundary, so the workspace shell and
 * the loading shape are on screen while this awaits. A case that does not
 * exist and one this educator may not open are the same answer on purpose.
 *
 * The queue's filters ride along in the query string and are handed to the
 * view, so every way back from here — including the way back from an error —
 * returns the teacher to the queue they were working in.
 */
export async function InterventionCase({ interventionId, query }) {
  const filters = filtersFromQuery(new URLSearchParams(query ?? {}));
  const at = query?.at === "record" ? "record" : null;
  const { caseDetail, error } = await readInterventionCase(interventionId);

  if (error || !caseDetail) {
    return <Unavailable reason={error} backHref={queueHref(filters)} />;
  }

  return <InterventionCaseView caseDetail={caseDetail} filters={filters} at={at} />;
}
