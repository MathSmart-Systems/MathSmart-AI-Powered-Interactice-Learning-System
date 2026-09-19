"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";

import { fetchPatternAnalysis } from "../services/interventions-api";
import {
  buildClassPatternAnalysisPayload,
  provenanceLabel,
  readAdvisory,
} from "../utils/intervention-helpers";

/**
 * A class-level advisory pattern summary for the filtered batch.
 *
 * Only appears when the teacher has scoped the queue by grade and/or competency
 * and there is at least one case; the payload aggregates severity and status
 * counts with no learner identity, and every failure mode collapses to a quiet
 * note. It never decides which learners need help or alters the queue.
 *
 * @param {object} props
 * @param {Array<object>} props.cases - The filtered queue rows
 * @param {string|null} props.gradeId
 * @param {string|null} props.competencyId
 * @param {Array<object>} props.grades
 */
export function PatternAnalysisPanel({ cases = [], gradeId = null, competencyId = null, grades = [] }) {
  const [state, setState] = useState({ result: null, loading: false });
  const [nonce, setNonce] = useState(0);

  const scopeKey = `${gradeId ?? ""}|${competencyId ?? ""}`;
  const hasCases = Array.isArray(cases) && cases.length > 0;

  useEffect(() => {
    let active = true;
    if (!hasCases || !scopeKey) return undefined;

    const payload = buildClassPatternAnalysisPayload(cases, {
      gradeId,
      competencyId,
      grades,
    });
    if (!payload) return undefined;

    Promise.resolve()
      .then(() => setState((current) => ({ result: null, loading: true })))
      .then(() => fetchPatternAnalysis(payload))
      .then((result) => {
        if (!active) return;
        setState({ result: readAdvisory(result, "misconception_summary"), loading: false });
      })
      .catch(() => {
        if (active) setState({ result: null, loading: false });
      });

    return () => {
      active = false;
    };
  }, [hasCases, scopeKey, gradeId, competencyId, grades, cases, nonce]);

  if (!hasCases || !scopeKey) return null;

  if (state.loading) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground"
      >
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
        Summarising patterns across this batch (advisory)...
      </p>
    );
  }

  if (state.result) {
    return (
      <div className="space-y-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 aria-hidden="true" className="size-4 text-indigo-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              AI pattern summary (advisory)
            </h4>
          </div>
          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1 text-[11px] font-semibold text-foreground shadow-xs transition-colors hover:bg-muted/40"
          >
            <RefreshCw aria-hidden="true" className="size-3" />
            Regenerate
          </button>
        </div>
        <p className="text-sm leading-relaxed text-foreground">{state.result.text}</p>
        {provenanceLabel(state.result) ? (
          <p className="text-[11px] text-muted-foreground">{provenanceLabel(state.result)}</p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          Advisory text is generated and should be reviewed by a teacher before acting on it.
        </p>
      </div>
    );
  }

  return (
    <p
      role="note"
      className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground"
    >
      Advisory AI is not available. The deterministic queue above is unaffected.
    </p>
  );
}