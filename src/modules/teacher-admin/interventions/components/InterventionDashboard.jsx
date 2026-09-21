"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, Download, X } from "lucide-react";

import { useInterventionQueue } from "../hooks/useInterventionQueue";
import { useInterventionActions } from "../hooks/useInterventionActions";
import { useQueueScrollMemory } from "../hooks/useQueueScrollMemory";
import { useQueueShortcuts } from "../hooks/useQueueShortcuts";
import { InterventionFilters } from "./InterventionFilters";
import { InterventionCaseTable } from "./InterventionCaseTable";
import { PatternAnalysisPanel } from "./PatternAnalysisPanel";
import { ReportPrintPane } from "./ReportPrintPane";
import { WeeklySummaryCard } from "./WeeklySummaryCard";
import {
  caseHref,
  casesToCsv,
  downloadCsv,
  eligibleForStatus,
  filtersToQuery,
} from "../utils/intervention-helpers";

const BULK_BUTTON_STYLE =
  "inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-60";

/**
 * Teacher Intervention Dashboard.
 *
 * The queue, filters, and every score are deterministic and render without any
 * AI dependency. AI is advisory only and would be layered on later; its absence
 * changes nothing here.
 *
 * A case opens as its own page rather than a dialog over this one, so the
 * filters live in the address: a row link carries them, the case page hands
 * them back, and the browser's own back button restores both them and the
 * place in the list.
 *
 * Keyboard shortcuts: "/" focuses the filter bar, "n" opens the first case in
 * the queue.
 *
 * @param {object} props
 * @param {Array<object>} props.initialCases
 * @param {Array<object>} props.sections
 * @param {Array<object>} props.competencies
 * @param {string} [props.initialError]
 */
export function InterventionDashboard({
  initialCases = [],
  sections = [],
  competencies = [],
  initialError = undefined,
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [printReport, setPrintReport] = useState(null);
  const queue = useInterventionQueue(initialCases);
  const actions = useInterventionActions();
  const listRef = useQueueScrollMemory(filtersToQuery(queue.filters));

  useEffect(() => {
    if (!printReport) return undefined;
    const frame = requestAnimationFrame(() => window.print());
    const done = () => setPrintReport(null);
    window.addEventListener("afterprint", done);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", done);
    };
  }, [printReport]);

  const selectedCases = queue.cases.filter((item) => selectedIds.has(item.id));
  const allSelected = queue.cases.length > 0 && selectedIds.size === queue.cases.length;

  const applySaved = useCallback((updated) => {
    if (!updated?.id) return;
    queue.applyCase(updated);
    queue.refresh();
  }, [queue]);

  const handlePrintReport = useCallback((report) => {
    setPrintReport(report);
  }, []);

  const handleQuickStatus = useCallback(
    async (interventionId, status) => {
      const updated = await actions.setCaseStatus(interventionId, status);
      if (updated) applySaved(updated);
      // Callers need the result: a failed mutation must not look like a save.
      return updated;
    },
    [actions, applySaved]
  );

  const handleToggleSelected = useCallback((interventionId, selected) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(interventionId);
      else next.delete(interventionId);
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedIds((current) =>
      current.size > 0 && current.size === queue.cases.length
        ? new Set()
        : new Set(queue.cases.map((item) => item.id))
    );
  }, [queue.cases]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkStatus = useCallback(
    async (status) => {
      const eligible = eligibleForStatus(selectedCases, status);
      if (eligible.length === 0) return;
      setBulkBusy(true);
      try {
        for (const item of eligible) {
          const updated = await actions.setCaseStatus(item.id, status);
          // applyCase already replaces and re-sorts the row locally, so the
          // loop does not refresh; the single refresh below reconciles once.
          if (updated) queue.applyCase(updated);
        }
      } finally {
        setBulkBusy(false);
        setSelectedIds(new Set());
        queue.refresh();
      }
    },
    [actions, queue, selectedCases]
  );

  const handleExportCsv = useCallback(() => {
    if (selectedCases.length === 0) return;
    downloadCsv(
      casesToCsv(selectedCases),
      `mathsmart-interventions-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }, [selectedCases]);

  const handleNextCase = useCallback(() => {
    const first = queue.cases[0];
    if (!first) return;
    router.push(caseHref(first.id, queue.filters));
  }, [queue.cases, queue.filters, router]);

  const filterFocusRef = useQueueShortcuts({ onNextCase: handleNextCase });

  // A successful client load retires the server component's own read error.
  const pageError = queue.error ?? (queue.loaded ? undefined : initialError);

  return (
    <div ref={listRef} className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
          <AlertTriangle aria-hidden="true" className="size-3.5" />
          ARAL Targeted Pedagogical Remediation
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Teacher Intervention Dashboard
        </h1>
        <span aria-hidden="true" className="h-0.5 w-16 bg-primary" />
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Diagnose learning obstacles, review deterministic evidence, and record targeted remediation
          actions for students who need support. Press <kbd className="rounded bg-muted px-1 font-mono text-[11px]">/</kbd> to
          focus filters and <kbd className="rounded bg-muted px-1 font-mono text-[11px]">n</kbd> to open the first case.
        </p>
      </header>

      <InterventionFilters
        filters={queue.filters}
        onChange={queue.setFilter}
        onApply={queue.applyFilters}
        onClear={queue.clearFilters}
        competencies={competencies}
        sections={sections}
        disabled={queue.loading}
        cases={queue.cases}
        focusRef={filterFocusRef}
      />

      <PatternAnalysisPanel
        cases={queue.cases}
        sectionId={queue.filters.sectionId}
        competencyId={queue.filters.competencyId}
        sections={sections}
      />

      {queue.cases.length > 0 ? <WeeklySummaryCard cases={queue.cases} /> : null}

      {selectedIds.size > 0 ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
          role="toolbar"
          aria-label="Bulk actions"
        >
          <p className="text-xs font-semibold text-foreground" role="status">
            <strong className="tabular-nums">{selectedIds.size}</strong> selected
          </p>
          <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
          <button
            type="button"
            onClick={() => handleBulkStatus("In Progress")}
            disabled={bulkBusy || eligibleForStatus(selectedCases, "In Progress").length === 0}
            className={BULK_BUTTON_STYLE}
          >
            <Clock aria-hidden="true" className="size-3.5" />
            Mark In Progress
          </button>
          <button
            type="button"
            onClick={() => handleBulkStatus("Resolved")}
            disabled={bulkBusy || eligibleForStatus(selectedCases, "Resolved").length === 0}
            className={BULK_BUTTON_STYLE}
          >
            <CheckCircle2 aria-hidden="true" className="size-3.5 text-emerald-700" />
            Mark Resolved
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={bulkBusy}
            className={BULK_BUTTON_STYLE}
          >
            <Download aria-hidden="true" className="size-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handleClearSelection}
            disabled={bulkBusy}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <X aria-hidden="true" className="size-3.5" />
            Clear
          </button>
          {bulkBusy ? (
            <p role="status" className="text-xs text-muted-foreground">
              Updating selected cases...
            </p>
          ) : null}
        </div>
      ) : null}

      <InterventionCaseTable
        cases={queue.cases}
        filters={queue.filters}
        onQuickStatus={handleQuickStatus}
        onToggleSelected={handleToggleSelected}
        onToggleSelectAll={handleToggleSelectAll}
        selectedIds={selectedIds}
        allSelected={allSelected}
        disabled={bulkBusy}
        loading={queue.loading}
        error={pageError}
        onRetry={queue.refresh}
      />

      <ReportPrintPane report={printReport} />
    </div>
  );
}