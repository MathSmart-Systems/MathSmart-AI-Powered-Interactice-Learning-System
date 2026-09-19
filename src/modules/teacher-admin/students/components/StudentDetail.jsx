import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DETAIL_ERROR, readStudentDetail } from "../services/student-detail-data";
import { StudentDetailView } from "./StudentDetailView";

/** What to say when the record cannot be shown, and why. */
const REASONS = {
  [DETAIL_ERROR.NOT_FOUND]: {
    title: "No such learner",
    body: "This learner record does not exist, or it is not one you can open. Check the roster for the learner you meant.",
  },
  [DETAIL_ERROR.FORBIDDEN]: {
    title: "Not available to this account",
    body: "Learner records are available to Teacher/Administrator accounts.",
  },
  [DETAIL_ERROR.SESSION]: {
    title: "Your session has ended",
    body: "Sign in again to open a learner record.",
  },
  [DETAIL_ERROR.UNCONFIGURED]: {
    title: "The learner service is not configured",
    body: "The MathSmart API address is missing from this deployment, so learner records cannot be read.",
  },
  [DETAIL_ERROR.UNAVAILABLE]: {
    title: "The learner record could not be read",
    body: "The service did not answer. Reload the page to try again.",
  },
};

function Unavailable({ reason }) {
  const { title, body } = REASONS[reason] ?? REASONS[DETAIL_ERROR.UNAVAILABLE];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/teacher/students"
        className="inline-flex w-fit items-center gap-2 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to the student roster
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
 * Reads one learner's record and renders whichever outcome applies.
 *
 * The route wraps this in a `<Suspense>` boundary, so the workspace shell and
 * the loading shape are on screen while this awaits. A learner who does not
 * exist and one this educator may not open are the same answer on purpose.
 */
export async function StudentDetail({ studentId }) {
  const { student, progress, error } = await readStudentDetail(studentId);

  if (error || !student) return <Unavailable reason={error} />;

  return <StudentDetailView student={student} progress={progress} />;
}
