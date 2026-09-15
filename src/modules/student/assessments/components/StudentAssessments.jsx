import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ASSESSMENTS_STATE, readOwnAssessmentHistory } from "../services/assessment-history";

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

export function AssessmentHistorySkeleton() {
  return <p role="status" className="py-8 text-sm text-muted-foreground">Loading recent attempts…</p>;
}

export async function StudentAssessments() {
  const history = await readOwnAssessmentHistory();

  return (
    <section className="flex flex-col gap-8" aria-labelledby="assessments-heading">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">Student assessments</p>
        <h1 id="assessments-heading" className="font-display text-3xl font-semibold tracking-tight text-foreground">Assessments</h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">Discover your diagnostic and review your own recent assessment attempts.</p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary"><ClipboardCheck aria-hidden="true" className="size-5" /></div>
          <CardTitle>Diagnostic assessment</CardTitle>
          <CardDescription className="max-w-prose leading-relaxed">MathSmart checks your current competency level and uses the result to prepare your learning path.</CardDescription>
        </CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Grade 6 Mathematics · Timed assessment · Progress can be resumed</p></CardContent>
        <CardFooter className="border-t border-border pt-6">
          <Button asChild size="lg"><Link href="/student/assessments/diagnostic">Open diagnostic<ArrowRight aria-hidden="true" /></Link></Button>
        </CardFooter>
      </Card>

      <section aria-labelledby="attempt-history-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="attempt-history-heading" className="font-display text-xl font-semibold text-foreground">Recent attempt history</h2>
          <p className="text-sm text-muted-foreground">Only attempts belonging to your learner profile appear here.</p>
        </div>

        {history.state === ASSESSMENTS_STATE.ERROR && (
          <div role="alert" className="border border-border bg-card p-5">
            <p className="font-medium text-foreground">Attempt history could not be loaded</p>
            <p className="mt-1 text-sm text-muted-foreground">Your diagnostic is still available above. Refresh this page to try loading history again.</p>
          </div>
        )}
        {history.state === ASSESSMENTS_STATE.NO_PROFILE && (
          <div className="border border-border bg-card p-5">
            <p className="font-medium text-foreground">Learner profile unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">Ask your teacher to finish setting up your learner profile.</p>
          </div>
        )}
        {history.state === ASSESSMENTS_STATE.READY && history.attempts.length === 0 && (
          <div className="border border-border bg-card p-5"><p className="font-medium text-foreground">No assessment attempts yet</p><p className="mt-1 text-sm text-muted-foreground">Your diagnostic attempts and reports will appear here after you begin.</p></div>
        )}
        {history.state === ASSESSMENTS_STATE.READY && history.attempts.length > 0 && (
          <ul className="divide-y divide-border border border-border bg-card">
            {history.attempts.map((attempt) => (
              <li key={attempt.attemptId} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-foreground">{attempt.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{formatDate(attempt.submittedAt ?? attempt.startedAt)}{attempt.score === null ? "" : ` · ${attempt.score}%`}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{attempt.statusLabel}</Badge>
                  {attempt.reportHref && <Button asChild variant="outline" size="sm"><Link href={attempt.reportHref}>View report</Link></Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
