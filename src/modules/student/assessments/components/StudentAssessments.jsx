import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  CATALOGUE_STATE,
  readAssessmentCatalogue,
} from "../services/assessment-catalogue";
import { ASSESSMENTS_STATE, readOwnAssessmentHistory } from "../services/assessment-history";

import { AssessmentCatalogue } from "./AssessmentCatalogue";

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

export function AssessmentHistorySkeleton() {
  return (
    <p role="status" className="py-8 text-sm text-muted-foreground">
      Loading your assessments…
    </p>
  );
}

/**
 * The assessments hub.
 *
 * This used to be one hard-coded card pointing at the diagnostic route, with
 * the dynamic route redirecting everything back to it. A unit quiz a teacher
 * published was therefore unreachable no matter what the catalogue said, and
 * a learner had no way to see what had been set for them. Both halves now come
 * from the API: what is open, and what has already been sat.
 *
 * The two reads are independent on purpose. A history that fails should not
 * take the list of papers down with it, because the list is the part a learner
 * came here to act on.
 */
export async function StudentAssessments() {
  const [catalogue, history] = await Promise.all([
    readAssessmentCatalogue(),
    readOwnAssessmentHistory(),
  ]);

  return (
    <section className="flex flex-col gap-8" aria-labelledby="assessments-heading">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">Student assessments</p>
        <h1
          id="assessments-heading"
          className="font-display text-3xl font-semibold tracking-tight text-foreground"
        >
          Assessments
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Everything set for your grade, and the reports from the papers you have already
          finished.
        </p>
      </header>

      <section aria-labelledby="available-assessments-heading" className="flex flex-col gap-4">
        <div>
          <h2
            id="available-assessments-heading"
            className="font-display text-xl font-semibold text-foreground"
          >
            Set for you
          </h2>
          <p className="text-sm text-muted-foreground">
            Your teacher decides which papers appear here and when you may retake one.
          </p>
        </div>

        {catalogue.state === CATALOGUE_STATE.ERROR && (
          <div role="alert" className="border border-border bg-card p-5">
            <p className="font-medium text-foreground">Your assessments could not be loaded</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and refresh this page to try again.
            </p>
          </div>
        )}
        {catalogue.state === CATALOGUE_STATE.NO_PROFILE && (
          <div className="border border-border bg-card p-5">
            <p className="font-medium text-foreground">Learner profile unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask your teacher to finish setting up your learner profile.
            </p>
          </div>
        )}
        {catalogue.state === CATALOGUE_STATE.READY && (
          <AssessmentCatalogue assessments={catalogue.assessments} />
        )}
      </section>

      <section aria-labelledby="attempt-history-heading" className="flex flex-col gap-4">
        <div>
          <h2
            id="attempt-history-heading"
            className="font-display text-xl font-semibold text-foreground"
          >
            Recent attempt history
          </h2>
          <p className="text-sm text-muted-foreground">
            Only attempts belonging to your learner profile appear here.
          </p>
        </div>

        {history.state === ASSESSMENTS_STATE.ERROR && (
          <div role="alert" className="border border-border bg-card p-5">
            <p className="font-medium text-foreground">Attempt history could not be loaded</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your assessments above are still available. Refresh this page to try loading
              history again.
            </p>
          </div>
        )}
        {history.state === ASSESSMENTS_STATE.NO_PROFILE && (
          <div className="border border-border bg-card p-5">
            <p className="font-medium text-foreground">Learner profile unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask your teacher to finish setting up your learner profile.
            </p>
          </div>
        )}
        {history.state === ASSESSMENTS_STATE.READY && history.attempts.length === 0 && (
          <div className="border border-border bg-card p-5">
            <p className="font-medium text-foreground">No assessment attempts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your attempts and reports will appear here after you begin.
            </p>
          </div>
        )}
        {history.state === ASSESSMENTS_STATE.READY && history.attempts.length > 0 && (
          <ul className="divide-y divide-border border border-border bg-card">
            {history.attempts.map((attempt) => (
              <li
                key={attempt.attemptId}
                className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{attempt.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDate(attempt.submittedAt ?? attempt.startedAt)}
                    {attempt.score === null ? "" : ` · ${attempt.score}%`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{attempt.statusLabel}</Badge>
                  {attempt.reportHref && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={attempt.reportHref}>
                        View report
                        <span className="sr-only"> for {attempt.title}</span>
                      </Link>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
