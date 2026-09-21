"use client";

import { useCallback, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Toast } from "@/modules/shared";

import { requestReportSummary } from "../services/report-client.js";
import { reportQuery } from "../utils/report-filters.js";
import { settleSummary } from "../utils/report-summary.js";

const IDLE = { loading: false, summary: null, reason: null, failure: null, forQuery: null };

/**
 * An optional plain-language summary of the report on screen.
 *
 * Nothing is asked until the teacher asks. The report above is complete
 * without it, and nothing here can change a figure: the request names only
 * the filters, and the server reads the numbers itself. A summary belongs to
 * the filters it was asked for, so a changed report hides it rather than
 * leaving an explanation of different numbers on screen. Asking again keeps
 * the summary visible and replaces it only when a new one arrives.
 */
export function ReportSummaryPanel({ filters, disabled }) {
  const [state, setState] = useState(IDLE);
  const query = reportQuery({ ...filters, page: 1 });
  const current = state.forQuery === query;
  const summary = current ? state.summary : null;

  const ask = useCallback(async () => {
    setState((previous) =>
      previous.forQuery === query
        ? { ...previous, loading: true, failure: null }
        : { ...IDLE, loading: true, forQuery: query },
    );
    const result = await requestReportSummary(filters).catch(() => ({
      ok: false,
      status: null,
      code: "unreachable",
    }));
    setState((previous) =>
      previous.forQuery === query ? { ...settleSummary(previous, result), forQuery: query } : previous,
    );
  }, [filters, query]);

  const dismiss = useCallback(() => setState((previous) => ({ ...previous, failure: null })), []);
  const loading = current && state.loading;
  const reason = current ? state.reason : null;

  return (
    <section
      aria-labelledby="report-summary-heading"
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-secondary/30 p-4 sm:p-5 print:hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="report-summary-heading"
            className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground"
          >
            <Sparkles aria-hidden="true" className="size-4 text-muted-foreground" />
            Summary of this report
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">AI suggestion (advisory)</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={ask} disabled={disabled || loading}>
          <RefreshCw
            aria-hidden="true"
            className={`size-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
          {loading ? "Summarising…" : summary ? "Summarise again" : "Summarise"}
        </Button>
      </div>

      <div
        aria-live="polite"
        aria-busy={loading}
        className={`text-sm leading-relaxed text-foreground transition-opacity motion-reduce:transition-none ${
          loading && summary ? "opacity-60" : ""
        }`}
      >
        {summary ? (
          <div className="flex flex-col gap-3">
            <p>{summary.overview}</p>
            {summary.patterns.length > 0 ? (
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold text-muted-foreground">Likely patterns</h3>
                <ul className="list-disc space-y-0.5 pl-5 marker:text-muted-foreground">
                  {summary.patterns.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {summary.actions.length > 0 ? (
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold text-muted-foreground">Ideas for the class</h3>
                <ol className="list-decimal space-y-0.5 pl-5 marker:text-muted-foreground">
                  {summary.actions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        ) : loading ? (
          <p className="text-muted-foreground">Preparing a summary…</p>
        ) : reason ? (
          <p className="text-muted-foreground">{reason}</p>
        ) : (
          <p className="text-muted-foreground">
            Ask for a short explanation of these figures and the most-missed questions. The figures
            themselves never change.
          </p>
        )}
      </div>

      <Toast toast={current && state.failure ? { tone: "error", message: state.failure } : null} onDismiss={dismiss} />
    </section>
  );
}
