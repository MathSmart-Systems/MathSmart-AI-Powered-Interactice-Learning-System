"use client";

import { CalendarRange, Download } from "lucide-react";

import {
  casesToCsv,
  downloadCsv,
  formatDate,
  weeklySummary,
} from "../utils/intervention-helpers";

function SummaryStat({ label, value, tone = "default" }) {
  const toneClass =
    tone === "problem"
      ? "text-destructive"
      : tone === "good" ? "text-emerald-600" : "text-foreground";
  return (
    <div className="grid gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

/**
 * Deterministic weekly summary over the cases currently shown.
 *
 * Counts activity in the trailing seven days plus the open/priority load, and
 * can export this week's opened cases as the existing CSV. No AI is involved.
 *
 * @param {object} props
 * @param {Array<object>} props.cases - The queue rows currently on screen
 */
export function WeeklySummaryCard({ cases = [] }) {
  const summary = weeklySummary(cases);

  const handleExport = () => {
    downloadCsv(
      casesToCsv(summary.openedCases),
      `mathsmart-interventions-week-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`
    );
  };

  return (
    <section
      aria-label="Weekly summary"
      className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border border-border bg-muted/20 px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <CalendarRange aria-hidden="true" className="size-4 text-primary" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
          This week
          <span className="ml-1.5 font-normal normal-case text-muted-foreground">
            ({formatDate(summary.window.start.toISOString())} – {formatDate(summary.window.end.toISOString())})
          </span>
        </h3>
      </div>
      <span aria-hidden="true" className="hidden h-6 w-px bg-border md:block" />
      <SummaryStat label="Opened" value={summary.openedCount} tone="new" />
      <SummaryStat label="Resolved" value={summary.resolvedCount} tone="good" />
      <span aria-hidden="true" className="hidden h-6 w-px bg-border md:block" />
      <SummaryStat label="Not resolved" value={summary.unresolvedCount} />
      <SummaryStat label="High priority open" value={summary.highOpenCount} tone="problem" />
      <div className="ml-auto flex items-center gap-2">
        <p className="hidden text-[11px] text-muted-foreground sm:block">
          Covers {summary.openedCount} case{summary.openedCount === 1 ? "" : "s"} opened in the last 7 days
        </p>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-muted/40"
        >
          <Download aria-hidden="true" className="size-3.5" />
          Export week&apos;s CSV
        </button>
      </div>
    </section>
  );
}