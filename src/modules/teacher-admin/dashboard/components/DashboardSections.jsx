import Link from "next/link";
import { ArrowRight, BookOpenCheck, ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LinkPending } from "@/modules/shared";

import { FIELD_IDS, TEACHER_ROUTES } from "../utils/constants.js";
import { show } from "../utils/dashboard-model.js";

/**
 * A panel with a heading and, optionally, one link to where the full list is.
 *
 * Deliberately plain: one border, one padding, no shadow stack. The dashboard
 * is several of these side by side, and the version this replaced gave every
 * panel `p-6 sm:p-8` and a display-size heading, which is how a two-learner
 * class came to be five thousand pixels tall.
 */
function Panel({ id, title, action, children, className = "" }) {
  return (
    <section
      aria-labelledby={id}
      className={`flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="font-display text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PanelLink({ href, children, id }) {
  return (
    <Link
      id={id}
      href={href}
      className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {children}
      <LinkPending />
      <ArrowRight aria-hidden="true" className="size-3.5" />
    </Link>
  );
}

/**
 * The class in four numbers, as one strip rather than five cards.
 *
 * A zero is shown as 0. A figure the reply did not carry is shown as "—", so a
 * partial answer can never read as "nothing happening in this class". The
 * sections figure carries the way to manage them, where the question arises.
 */
export function ClassSummary({ summary, selectedSection }) {
  const diagnosticTotal =
    summary.diagnosticCompleted === null || summary.learners === null ? null : summary.learners;

  const figures = [
    { label: "Students", value: show(summary.learners) },
    {
      label: selectedSection ? "Section" : "Sections",
      value: selectedSection ? selectedSection.name : show(summary.sections),
      link: { href: TEACHER_ROUTES.SECTIONS, label: "Manage sections" },
    },
    {
      label: "Diagnostic done",
      value:
        diagnosticTotal === null
          ? "—"
          : `${summary.diagnosticCompleted} of ${diagnosticTotal}`,
      detail:
        summary.diagnosticInProgress === null
          ? null
          : `${summary.diagnosticInProgress} in progress · ${show(summary.diagnosticNotStarted)} not started`,
    },
    {
      label: "Class mastery",
      value: show(summary.averageMastery, "%"),
      detail: "Average of current competency scores",
    },
  ];

  return (
    <section aria-label="Class summary" className="rounded-xl border border-border bg-card">
      <dl className="grid grid-cols-2 divide-border lg:grid-cols-4 lg:divide-x">
        {figures.map((figure, index) => (
          <div
            key={figure.label}
            className={`flex min-w-0 flex-col gap-1 p-4 ${
              index % 2 === 1 ? "border-l border-border lg:border-l-0" : ""
            } ${index >= 2 ? "border-t border-border lg:border-t-0" : ""}`}
          >
            <dt className="text-xs font-medium text-muted-foreground">{figure.label}</dt>
            <dd className="truncate font-display text-2xl font-semibold tabular-nums text-foreground">
              {figure.value}
            </dd>
            {figure.detail ? (
              <dd className="text-xs text-muted-foreground">{figure.detail}</dd>
            ) : null}
            {figure.link ? (
              <dd>
                <PanelLink href={figure.link.href}>{figure.link.label}</PanelLink>
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Interventions by status, three numbers and one way to the queue.
 *
 * The previous page had one "open" count and two buttons to the same queue.
 * Waiting, in hand and closed are different jobs, so they are counted apart.
 */
export function InterventionSummary({ interventions }) {
  const figures = [
    { label: "Need action", value: interventions.needsIntervention, tone: "problem" },
    { label: "In progress", value: interventions.inProgress },
    { label: "Resolved", value: interventions.resolved },
  ];

  return (
    <Panel
      id="dashboard-interventions-heading"
      title="Interventions"
      action={
        <PanelLink id={FIELD_IDS.OPEN_INTERVENTIONS_LINK} href={TEACHER_ROUTES.INTERVENTIONS}>
          Open the queue
        </PanelLink>
      }
    >
      {/* Equal cards whose counts share one baseline. A narrow card wraps
          "Need action" onto two lines and leaves "Resolved" on one, so every
          label reserves two lines and the count always starts below them. */}
      <dl className="grid auto-rows-fr grid-cols-3 gap-2">
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="flex min-w-0 flex-col rounded-lg border border-border bg-background px-3 py-2"
          >
            <dt className="line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
              {figure.label}
            </dt>
            <dd
              className={`font-display text-xl font-semibold tabular-nums ${
                figure.tone === "problem" && figure.value > 0 ? "text-destructive" : "text-foreground"
              }`}
            >
              {show(figure.value)}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/**
 * The learners flagged for support, as compact rows with two real destinations.
 *
 * "View record" opens the learner's own page; the old link sent a query string
 * to the roster, which ignored it. "Open cases" opens the intervention queue
 * already narrowed to this learner.
 */
export function PriorityLearners({ priority }) {
  const hidden = priority.total - priority.shown.length;

  return (
    <Panel
      id="dashboard-priority-heading"
      title="Students who need support"
      action={<PanelLink href={TEACHER_ROUTES.STUDENTS}>All students</PanelLink>}
    >
      {priority.total === 0 ? (
        <p className="text-sm text-muted-foreground">
          No student needs support right now. Anyone the rules flag will appear here.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {priority.shown.map((learner) => (
              <li
                key={learner.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
              >
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
                >
                  {learner.initials}
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium text-foreground">{learner.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {learner.sectionName ?? "No section"}
                    {learner.statusLabel ? ` · ${learner.statusLabel}` : ""}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    Diagnostic {show(learner.diagnosticScore, "%")} → now{" "}
                    <span className="text-foreground">{show(learner.currentScore, "%")}</span>
                    {learner.openCases > 0
                      ? ` · ${learner.openCases} open case${learner.openCases === 1 ? "" : "s"}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      id={`${FIELD_IDS.VIEW_STUDENT_BTN_PREFIX}${learner.id}`}
                      href={TEACHER_ROUTES.student(learner.id)}
                      aria-label={`View the record for ${learner.fullName}`}
                    >
                      View record
                      <LinkPending />
                    </Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link
                      id={`${FIELD_IDS.RECORD_INTERVENTION_BTN_PREFIX}${learner.id}`}
                      href={TEACHER_ROUTES.learnerCases(learner.id)}
                      aria-label={`Open the intervention cases for ${learner.fullName}`}
                    >
                      Open cases
                      <LinkPending />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {hidden > 0 ? (
            <p className="text-xs text-muted-foreground">
              {hidden} more in the{" "}
              <Link
                href={TEACHER_ROUTES.INTERVENTIONS}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                intervention queue
              </Link>
              .
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

const TIME = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

function when(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : TIME.format(date);
}

/** The latest scored work across the class, newest first. */
export function RecentActivity({ items }) {
  return (
    <Panel
      id="dashboard-activity-heading"
      title="Recent activity"
      action={<PanelLink href={TEACHER_ROUTES.ASSESSMENTS}>View assessments</PanelLink>}
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing finished yet. Scored assessments and completed lessons will appear here.
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              {item.kind === "module" ? (
                <BookOpenCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              ) : (
                <ClipboardCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  <span className="font-medium">{item.fullName}</span>{" "}
                  {item.kind === "module" ? "finished" : "scored on"}{" "}
                  <span className="text-muted-foreground">{item.title}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.kind === "module" ? "Lesson" : `Assessment · ${show(item.score, "%")}`}
                  {when(item.occurredAt) ? ` · ${when(item.occurredAt)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

const BAND_TONE = {
  Mastered: "text-primary",
  Developing: "text-foreground",
  "Needs Improvement": "text-destructive",
};

/**
 * The published competencies most worth attention, weakest first.
 *
 * Published only, and a short list: the version this replaced listed every
 * competency ever written — drafts and archived ones included — and repeated
 * the privacy notice on each of sixty rows. The notice is said once here.
 */
export function CompetencySummary({ competencies }) {
  const hidden = competencies.total - competencies.shown.length;

  return (
    <Panel
      id="dashboard-competencies-heading"
      title="Competencies to watch"
      action={<PanelLink href={TEACHER_ROUTES.REPORTS}>Full report</PanelLink>}
    >
      {competencies.total === 0 ? (
        <p className="text-sm text-muted-foreground">
          {competencies.untracked > 0
            ? `No learner has started a competency yet. ${competencies.untracked} published competencies are waiting.`
            : "No published competencies yet. They appear here once learners start on them."}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {competencies.shown.map((competency) => (
              <li
                key={competency.id}
                className="grid grid-cols-1 gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{competency.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {competency.code ? `${competency.code} · ` : ""}
                    {show(competency.learnersTracked)} tracked
                  </p>
                </div>
                <p className="text-xs tabular-nums text-muted-foreground sm:text-right">
                  <span className="text-foreground">{show(competency.mastered)}</span> mastered ·{" "}
                  <span className="text-foreground">{show(competency.developing)}</span> developing ·{" "}
                  <span
                    className={competency.needsImprovement > 0 ? "text-destructive" : "text-foreground"}
                  >
                    {show(competency.needsImprovement)}
                  </span>{" "}
                  need practice
                  {competency.suppressed ? null : (
                    <span className={`block ${BAND_TONE[competency.band] ?? "text-foreground"}`}>
                      Average {show(competency.average, "%")}
                      {competency.band ? ` · ${competency.band}` : ""}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {hidden > 0 ? `${hidden} more in the full report. ` : ""}
            {competencies.untracked > 0
              ? `${competencies.untracked} not started by anyone yet. `
              : ""}
            {competencies.anySuppressed
              ? "Averages are hidden for groups of fewer than five learners, so no one learner can be identified."
              : null}
          </p>
        </>
      )}
    </Panel>
  );
}
