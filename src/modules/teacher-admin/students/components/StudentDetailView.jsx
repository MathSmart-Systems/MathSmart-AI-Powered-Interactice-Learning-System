"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { diagnosticStatus, isDropped, learnerStatus } from "../utils/labels";
import { buildInsightEvidence, weakestCompetency } from "../utils/insight-evidence";
import { MVP_GRADE_NAME, learnerName } from "../utils/roster";
import { StudentInsightPanel } from "./StudentInsightPanel";

/** A score as a percentage, or an em dash when nothing has been recorded. */
function percent(value) {
  const number = Number(value);
  if (value === null || value === undefined || !Number.isFinite(number)) return "—";
  return `${Math.round(number)}%`;
}

/** Growth, signed, so a fall reads as a fall. */
function growthLabel(value) {
  const number = Number(value);
  if (value === null || value === undefined || !Number.isFinite(number)) return "—";
  const rounded = Math.round(number);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function StatTile({ label, value, hint }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="font-display text-2xl font-semibold text-foreground">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function Fact({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * One learner's record.
 *
 * Deterministic evidence first and always: identity, enrollment, then the
 * numbers the learner's own work produced. The advisory note sits below them
 * and is allowed to be absent — a Groq outage costs this page nothing, because
 * nothing on it was waiting for Groq.
 *
 * Recurring-mistake analysis is deliberately not here. It needs per-question
 * text alongside a wrong verdict, which nothing in the system records; asking
 * for it with empty evidence would produce a confident paragraph about nothing.
 */
export function StudentDetailView({ student, progress }) {
  const name = learnerName(student);
  const diagnostic = diagnosticStatus(student?.diagnostic_status);
  // The same single status the roster shows: a dropped learner reads
  // "Dropped" here too, rather than reporting the monitoring state they were
  // in when they left.
  const monitoring = learnerStatus(student);

  const competencies = Array.isArray(progress?.competencies) ? progress.competencies : [];

  // One competency is worth a note: the one furthest from mastery. Choosing it
  // here keeps the advisory request to a single, bounded question.
  const focus = useMemo(() => weakestCompetency(progress), [progress]);
  const evidence = useMemo(() => buildInsightEvidence(progress, focus), [progress, focus]);

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/teacher/students"
        className="inline-flex w-fit items-center gap-2 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to the student roster
      </Link>

      <header className="flex flex-col gap-3">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <GraduationCap aria-hidden="true" className="size-3.5" />
          {student?.grade_name ?? MVP_GRADE_NAME}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
          {name}
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        <p className="font-mono text-sm text-muted-foreground">{student?.learner_id}</p>
      </header>

      {isDropped(student) ? (
        <p
          role="status"
          className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          This learner has been dropped and can no longer sign in. Everything recorded below is
          the work they did while they were enrolled. Restore them, or remove them permanently,
          from the roster.
        </p>
      ) : null}

      <section aria-labelledby="enrollment-heading">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2
              id="enrollment-heading"
              className="font-display text-base font-semibold text-foreground"
            >
              Enrollment
            </h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Grade">{student?.grade_name ?? MVP_GRADE_NAME}</Fact>
              <Fact label="Section">{student?.section_name ?? "No section assigned"}</Fact>
              <Fact label="Diagnostic">
                <Badge variant={diagnostic.variant}>{diagnostic.label}</Badge>
              </Fact>
              <Fact label="Status">
                <Badge variant={monitoring.variant}>{monitoring.label}</Badge>
              </Fact>
            </dl>
            {student?.school_name ? (
              <p className="text-sm text-muted-foreground">{student.school_name}</p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="progress-heading" className="flex flex-col gap-4">
        <h2 id="progress-heading" className="font-display text-base font-semibold text-foreground">
          Recorded progress
        </h2>

        {progress ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Overall mastery" value={percent(progress.overall_mastery)} />
              <StatTile label="Diagnostic" value={percent(progress.diagnostic_score)} />
              <StatTile
                label="Growth"
                value={growthLabel(progress.growth)}
                hint="Current minus diagnostic"
              />
              <StatTile
                label="Modules completed"
                value={`${progress.modules_completed_count ?? 0}/${progress.total_modules_count ?? 0}`}
              />
            </div>

            {competencies.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-background/50 px-4 py-6 text-center text-sm text-muted-foreground">
                No competency work recorded yet. Scores appear here once this learner attempts an
                assessment or an activity.
              </p>
            ) : (
              <Card>
                <CardContent>
                  <ul className="@container space-y-2">
                    {competencies.map((item) => (
                      <li
                        key={item.competency_id}
                        className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-2.5 @md:flex-row @md:items-center @md:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {item.competency_name}
                          </p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {item.competency_code}
                          </p>
                        </div>
                        <dl className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <div className="flex items-center gap-1">
                            <dt className="text-muted-foreground">Diagnostic</dt>
                            <dd className="font-semibold text-foreground">
                              {percent(item.diagnostic_score)}
                            </dd>
                          </div>
                          <div className="flex items-center gap-1">
                            <dt className="text-muted-foreground">Current</dt>
                            <dd className="font-semibold text-foreground">
                              {percent(item.current_score)}
                            </dd>
                          </div>
                          <div className="flex items-center gap-1">
                            <dt className="text-muted-foreground">Attempts</dt>
                            <dd className="font-semibold text-foreground">
                              {item.attempt_count ?? 0}
                              {item.unsuccessful_attempts
                                ? ` (${item.unsuccessful_attempts} unsuccessful)`
                                : ""}
                            </dd>
                          </div>
                          {item.mastery_band ? (
                            <div className="flex items-center gap-1">
                              <dt className="sr-only">Mastery band</dt>
                              <dd>
                                <Badge variant="outline">{item.mastery_band}</Badge>
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <p className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-secondary-foreground">
            This learner&apos;s progress could not be read just now. Their enrollment above is
            accurate; reload to try the progress again.
          </p>
        )}
      </section>

      <StudentInsightPanel evidence={evidence} competencyName={focus?.competency_name ?? null} />
    </div>
  );
}
