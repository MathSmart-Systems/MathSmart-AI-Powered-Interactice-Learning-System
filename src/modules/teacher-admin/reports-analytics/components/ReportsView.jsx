"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, LoaderCircle, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ResultAnnouncer, Toast } from "@/modules/shared";

import { downloadProgressCsv } from "../services/report-client.js";
import { EMPTY_FILTERS, reportQuery, withFilter } from "../utils/report-filters.js";
import { buildReportModel } from "../utils/report-model.js";
import { ReportPrint } from "./ReportPrint.jsx";
import {
  ActivityPanel,
  CompetencyPanel,
  InterventionPanel,
  MostMissed,
  SectionTable,
  SummaryStrip,
  WatchList,
} from "./ReportSections.jsx";
import { ReportFilters } from "./ReportFilters.jsx";
import { ReportSummaryPanel } from "./ReportSummaryPanel.jsx";

function scopeText(filters, sections, competencies, learners) {
  const parts = [];
  parts.push(sections.find((row) => row.id === filters.sectionId)?.name ?? "All Grade 6 sections");
  const competency = competencies.find((row) => row.id === filters.competencyId);
  if (competency) parts.push(competency.code ?? competency.name);
  if (filters.from || filters.to) {
    parts.push(`${filters.from ?? "the start"} to ${filters.to ?? "today"}`);
  }
  const count = learners === null ? "" : `${learners} student${learners === 1 ? "" : "s"} · `;
  return `${count}${parts.join(" · ")}`;
}

/**
 * Reports & Analytics for the filters in the address.
 *
 * Filters live in the URL. A change replaces it inside a transition, so the
 * server renders the new report while this one stays on screen, dimmed, where
 * the teacher left it: no skeleton, no jump to the top. A failed read is said
 * beside the filters and never replaces them. Every figure is the server's;
 * the optional AI summary sits below the figures it explains.
 */
export function ReportsView({ overview, filters, sections, competencies, menusUnavailable, error }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const model = useMemo(() => buildReportModel(overview), [overview]);
  const dated = Boolean(filters.from || filters.to);
  const scope = scopeText(filters, sections, competencies, model.summary.learners);

  const go = (next) => {
    startTransition(() => {
      router.replace(`${pathname}${reportQuery(next)}`, { scroll: false });
    });
  };

  const exportCsv = async () => {
    setExporting(true);
    const result = await downloadProgressCsv(filters);
    setExporting(false);
    setToast(
      result.ok
        ? { tone: "success", message: `Exported ${result.filename}.` }
        : { tone: "error", message: result.message },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Grade 6 Mathematics</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Reports and Analytics
          </h1>
          <span aria-hidden="true" className="mt-2 block h-0.5 w-16 bg-primary" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={exportCsv}
            disabled={exporting || Boolean(error)}
            aria-describedby="report-export-note"
          >
            {exporting ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Download aria-hidden="true" className="size-4" />
            )}
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => window.print()} disabled={Boolean(error)}>
            <Printer aria-hidden="true" className="size-4" />
            Print
          </Button>
          <p id="report-export-note" className="sr-only">
            The CSV lists every student in the chosen section and status.
          </p>
        </div>
      </header>

      <ReportFilters
        filters={filters}
        sections={sections}
        competencies={competencies}
        onChange={(key, value) => go(withFilter(filters, key, value))}
        onReset={() => go(EMPTY_FILTERS)}
        pending={pending}
        menusUnavailable={menusUnavailable}
      />
      <ResultAnnouncer message={error ? "" : `Showing ${scope}.`} />

      {error ? (
        <section
          role="alert"
          className="flex flex-col gap-3 rounded-xl border-l-[3px] border-destructive bg-destructive/5 px-4 py-4"
        >
          <div>
            <h2 className="font-semibold text-foreground">The report could not be loaded</h2>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <div>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
              {pending ? "Trying again…" : "Try again"}
            </Button>
          </div>
        </section>
      ) : (
        <div
          aria-busy={pending}
          className={`flex flex-col gap-5 transition-opacity motion-reduce:transition-none ${pending ? "opacity-60" : ""}`}
        >
          <p className="-mt-2 text-sm text-muted-foreground" data-testid="report-scope">{scope}</p>

          {model.isEmpty ? (
            <section className="rounded-xl border border-border bg-card px-4 py-6">
              <h2 className="font-display text-lg font-semibold text-foreground">No students match these filters</h2>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                Choose another section or status, or clear the filters to see all of Grade 6.
              </p>
            </section>
          ) : (
            <>
              <SummaryStrip
                summary={model.summary}
                interventions={model.interventions}
                minimum={model.minimumForAverage}
              />
              <CompetencyPanel competencies={model.competencies} minimum={model.minimumForAverage} />
              <WatchList
                watchList={model.watchList}
                pending={pending}
                onPage={(page) => go({ ...filters, page })}
              />
              <div className="grid items-start gap-5 lg:grid-cols-2">
                <MostMissed rows={model.mostMissed} minimum={model.minimumForAverage} />
                <div className="flex min-w-0 flex-col gap-5">
                  <ActivityPanel activity={model.activity} dated={dated} />
                  <InterventionPanel interventions={model.interventions} dated={dated} />
                </div>
              </div>
              <ReportSummaryPanel filters={filters} disabled={pending} />
              <SectionTable sections={model.sections} />
            </>
          )}
        </div>
      )}

      {!error ? <ReportPrint model={model} scope={scope} /> : null}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
