"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LinkPending } from "@/modules/shared";

import { pageCount, showCount } from "../utils/report-model.js";

export const STUDENT_HREF = (id) => `/teacher/students/${encodeURIComponent(id)}`;
export const CASES_HREF = (id) => `/teacher/interventions?student=${encodeURIComponent(id)}`;

/** One plain panel: a heading, an optional action, and its content. */
export function Panel({ id, title, description, action, children, className = "" }) {
  return (
    <section
      aria-labelledby={id}
      className={`flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={id} className="font-display text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The report in five figures, as one strip.
 *
 * Each figure is a label, a value and one line of detail, so every value sits
 * on the same line across the strip whatever its detail says.
 */
export function SummaryStrip({ summary, interventions, minimum }) {
  const diagnosticOf =
    summary.diagnosticCompleted === null || summary.learners === null
      ? "—"
      : `${summary.diagnosticCompleted} of ${summary.learners}`;
  const openCases =
    interventions.needsIntervention === null || interventions.inProgress === null
      ? null
      : interventions.needsIntervention + interventions.inProgress;

  const figures = [
    { label: "Students", value: showCount(summary.learners), detail: "Active accounts in this report" },
    {
      label: "Diagnostic done",
      value: diagnosticOf,
      detail: `${showCount(summary.diagnosticInProgress)} in progress · ${showCount(summary.diagnosticNotStarted)} not started`,
    },
    {
      label: "Current average",
      value: summary.averageCurrent,
      detail: summary.averagesWithheld
        ? `Shown once ${minimum} or more students have scores`
        : `Diagnostic ${summary.averageDiagnostic} · change ${summary.growth}`,
    },
    { label: "Needs support", value: showCount(summary.needsSupport), detail: "By the monitoring rules" },
    {
      label: "Open interventions",
      value: showCount(openCases),
      detail: `${showCount(interventions.needsIntervention)} waiting · ${showCount(interventions.inProgress)} in progress`,
    },
  ];

  return (
    // The dividers are the gaps of a grid over the border colour, so they sit
    // right at every breakpoint. The last figure spans the row when two
    // columns would leave it alone.
    <section aria-label="Report summary" className="overflow-hidden rounded-xl border border-border bg-border">
      <dl className="grid grid-cols-2 gap-px lg:grid-cols-5">
        {figures.map((figure, index) => (
          <div
            key={figure.label}
            className={`flex min-w-0 flex-col gap-1 bg-card p-4 ${
              index === figures.length - 1 ? "col-span-2 lg:col-span-1" : ""
            }`}
          >
            {/* Two lines reserved where five share a row, so a label that
                wraps never lowers its value below its neighbours'. */}
            <dt className="text-xs font-medium leading-4 text-muted-foreground lg:min-h-8">{figure.label}</dt>
            <dd className="font-display text-2xl font-semibold leading-8 tabular-nums text-foreground">
              {figure.value}
            </dd>
            <dd className="text-xs leading-4 text-muted-foreground">{figure.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const BAND_KEY = [
  { key: "mastered", label: "Mastered", className: "bg-primary" },
  { key: "developing", label: "Developing", className: "bg-primary/45" },
  { key: "needsImprovement", label: "Needs improvement", className: "bg-destructive/70" },
];

function BandBar({ row }) {
  if (!row.shares) {
    return <div className="h-2 rounded-full bg-muted" aria-hidden="true" />;
  }
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      {BAND_KEY.map((band) =>
        row.shares[band.key] > 0 ? (
          <span key={band.key} className={band.className} style={{ width: `${row.shares[band.key]}%` }} />
        ) : null,
      )}
    </div>
  );
}

function CompetencyRow({ row }) {
  return (
    <li className="grid gap-x-6 gap-y-1.5 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] md:items-center xl:grid-cols-[minmax(0,1fr)_19rem_13rem]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground" title={row.name}>
          {row.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {row.code ? `${row.code} · ` : ""}
          {row.tracked === 0 ? "No progress yet" : `${row.tracked} student${row.tracked === 1 ? "" : "s"}`}
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <BandBar row={row} />
        <p className="text-xs tabular-nums text-muted-foreground">
          {row.bands.mastered} mastered · {row.bands.developing} developing · {row.bands.needsImprovement} need improvement
        </p>
      </div>
      <p className="text-xs tabular-nums text-muted-foreground md:col-span-2 xl:col-span-1 xl:text-right">
        Average <span className="font-semibold text-foreground">{row.average}</span>
        <span className="mx-1.5" aria-hidden="true">·</span>
        Change <span className="font-semibold text-foreground">{row.growth}</span>
      </p>
    </li>
  );
}

/**
 * Competencies in order of learning need, five at a time.
 *
 * "View all" opens the rest in place, under the same filters, rather than on
 * another page. The bar is a picture of the three counts printed under it,
 * never the only place they appear.
 */
export function CompetencyPanel({ competencies, minimum }) {
  const [expanded, setExpanded] = useState(false);
  const held = useRef(null);
  const rows = expanded ? competencies.all : competencies.preview;

  // Rows opened by "View all" appear below where the teacher is reading.
  // Scroll anchoring would keep the button still and push the new rows up out
  // of view, so the page is held exactly where it was.
  useLayoutEffect(() => {
    if (held.current === null) return;
    window.scrollTo({ top: held.current, behavior: "instant" });
    held.current = null;
  }, [expanded]);

  const toggle = () => {
    held.current = window.scrollY;
    setExpanded((value) => !value);
  };
  const remaining = competencies.total - competencies.preview.length;

  return (
    <Panel
      id="report-competencies"
      title="Competency mastery"
      description={`Published competencies, greatest learning need first. Averages need ${minimum} or more students.`}
      action={
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Bar key">
          {BAND_KEY.map((band) => (
            <li key={band.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-2.5 rounded-sm ${band.className}`} />
              {band.label}
            </li>
          ))}
        </ul>
      }
    >
      {competencies.total === 0 ? (
        <p className="text-sm text-muted-foreground">No published competencies match these filters.</p>
      ) : (
        <>
          <ul id="report-competency-list" className="divide-y divide-border">
            {(rows.length ? rows : competencies.all.slice(0, 5)).map((row) => (
              <CompetencyRow key={row.id} row={row} />
            ))}
          </ul>
          {remaining > 0 ? (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={expanded}
                aria-controls="report-competency-list"
                onClick={toggle}
                className="-ml-2 text-primary"
              >
                {expanded ? "Show the top 5" : `View all competencies (${competencies.total})`}
                <ChevronDown
                  aria-hidden="true"
                  className={`size-4 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
                />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function StatusText({ row }) {
  const parts = [];
  if (row.statusLabel) parts.push(row.statusLabel);
  parts.push(row.openCases > 0 ? `${row.openCases} open case${row.openCases === 1 ? "" : "s"}` : "No open cases");
  return parts.join(" · ");
}

/**
 * The students to watch: those the rules say need support, and those with an
 * open case. A table where there is room for one; a list of short cards where
 * there is not, so no column is ever cut off or scrolled sideways.
 */
export function WatchList({ watchList, onPage, pending }) {
  const pages = pageCount(watchList);
  const first = watchList.total === 0 ? 0 : (watchList.page - 1) * watchList.pageSize + 1;
  const last = Math.min(watchList.total, watchList.page * watchList.pageSize);

  return (
    <Panel
      id="report-watch-list"
      title="Students needing support"
      description="Flagged by the monitoring rules, or with an intervention still open."
      action={
        watchList.total > 0 ? (
          <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {first}–{last} of {watchList.total}
          </p>
        ) : null
      }
    >
      {watchList.total === 0 ? (
        <p className="text-sm text-muted-foreground">
          No student in this report needs support or has an open case.
        </p>
      ) : (
        <>
          <table className="hidden w-full table-fixed text-sm lg:table">
            <caption className="sr-only">Students needing support</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="w-[32%] pb-2 font-medium">Student</th>
                <th scope="col" className="w-[18%] pb-2 font-medium">Section</th>
                <th scope="col" className="w-[18%] pb-2 font-medium">Diagnostic → current</th>
                <th scope="col" className="w-[18%] pb-2 font-medium">Status</th>
                <th scope="col" className="w-[14%] pb-2 text-right font-medium">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {watchList.rows.map((row) => (
                <tr key={row.id} className="align-middle">
                  <td className="py-2.5 pr-3">
                    <p className="truncate font-medium text-foreground" title={row.name}>{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.learnerId}</p>
                  </td>
                  <td className="truncate py-2.5 pr-3 text-muted-foreground">{row.section ?? "No section"}</td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {row.diagnostic} → <span className="font-semibold">{row.current}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground"><StatusText row={row} /></td>
                  <td className="py-2.5 text-right">
                    <Link
                      href={STUDENT_HREF(row.id)}
                      aria-label={`View the record for ${row.name}`}
                      className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      View record
                      <LinkPending />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="flex flex-col gap-2 lg:hidden">
            {watchList.rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.learnerId} · {row.section ?? "No section"}
                    </p>
                  </div>
                  <Link
                    href={STUDENT_HREF(row.id)}
                    aria-label={`View the record for ${row.name}`}
                    className="shrink-0 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    View record
                  </Link>
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">
                  Diagnostic {row.diagnostic} → now <span className="font-semibold text-foreground">{row.current}</span>
                </p>
                <p className="text-xs text-muted-foreground"><StatusText row={row} /></p>
              </li>
            ))}
          </ul>

          {pages > 1 ? (
            <nav aria-label="Pages of students" className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || watchList.page <= 1}
                onClick={() => onPage(watchList.page - 1)}
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
                Previous
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                Page {watchList.page} of {pages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || watchList.page >= pages}
                onClick={() => onPage(watchList.page + 1)}
              >
                Next
                <ChevronRight aria-hidden="true" className="size-4" />
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/**
 * The questions the class missed most, across diagnostics and practice.
 * Only questions answered by enough students appear at all.
 */
export function MostMissed({ rows, minimum }) {
  return (
    <Panel
      id="report-most-missed"
      title="Most-missed questions"
      description={`Questions answered by ${minimum} or more students, most often wrong first.`}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No question has been answered by {minimum} or more students in this report yet.
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <p className="text-sm text-foreground">{row.prompt}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {row.competencyCode ? `${row.competencyCode} · ` : ""}
                <span className="font-semibold text-foreground">
                  {row.incorrect} of {row.answered}
                </span>{" "}
                answers wrong
                {row.commonWrongAnswer
                  ? ` · most common wrong answer “${row.commonWrongAnswer}” (${row.commonWrongCount})`
                  : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Figure({ label, value, detail }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-foreground">{value}</dd>
      {detail ? <dd className="text-xs text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}

export function ActivityPanel({ activity, dated }) {
  const passRate =
    activity.activityAttempts > 0 && activity.activityPassed !== null
      ? `${activity.activityPassed} of ${activity.activityAttempts} passed`
      : "No attempts";
  return (
    <Panel
      id="report-activity"
      title="Assessments and practice"
      description={dated ? "Work submitted in the chosen dates." : "All submitted work."}
    >
      <dl className="grid grid-cols-2 gap-4">
        <Figure label="Assessments scored" value={showCount(activity.assessmentsScored)} detail={`Average ${activity.assessmentAverage}`} />
        <Figure label="Practice attempts" value={showCount(activity.activityAttempts)} detail={passRate} />
        <Figure label="Practice average" value={activity.activityAverage} />
        <Figure label="Lessons completed" value={showCount(activity.modulesCompleted)} />
      </dl>
    </Panel>
  );
}

export function InterventionPanel({ interventions, dated }) {
  const median =
    interventions.medianDays === null
      ? "—"
      : `${interventions.medianDays} day${interventions.medianDays === 1 ? "" : "s"}`;
  return (
    <Panel
      id="report-interventions"
      title="Interventions"
      description="Where each case stands now, and what changed in the dates."
    >
      <dl className="grid grid-cols-3 gap-4">
        <Figure label="Waiting" value={showCount(interventions.needsIntervention)} />
        <Figure label="In progress" value={showCount(interventions.inProgress)} />
        <Figure label="Resolved" value={showCount(interventions.resolved)} />
      </dl>
      <p className="border-t border-border pt-3 text-xs tabular-nums text-muted-foreground">
        {dated ? "In these dates: " : "All time: "}
        <span className="font-semibold text-foreground">{showCount(interventions.openedInRange)}</span> opened ·{" "}
        <span className="font-semibold text-foreground">{showCount(interventions.resolvedInRange)}</span> resolved ·
        median time to resolve <span className="font-semibold text-foreground">{median}</span>
      </p>
    </Panel>
  );
}

export function SectionTable({ sections }) {
  if (sections.length === 0) return null;
  return (
    <Panel id="report-sections" title="Sections" description="Active sections in this report.">
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">Section performance</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="w-[34%] pb-2 font-medium">Section</th>
            <th scope="col" className="pb-2 text-right font-medium">Students</th>
            <th scope="col" className="hidden pb-2 text-right font-medium sm:table-cell">Diagnostic done</th>
            <th scope="col" className="pb-2 text-right font-medium">Needs support</th>
            <th scope="col" className="pb-2 text-right font-medium">Average</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border tabular-nums">
          {sections.map((section) => (
            <tr key={section.id}>
              <th scope="row" className="truncate py-2 pr-2 text-left font-medium text-foreground">
                {section.name}
              </th>
              <td className="py-2 text-right">{showCount(section.learners)}</td>
              <td className="hidden py-2 text-right sm:table-cell">{showCount(section.diagnosticCompleted)}</td>
              <td className="py-2 text-right">{showCount(section.needsSupport)}</td>
              <td className="py-2 text-right">{section.average}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
