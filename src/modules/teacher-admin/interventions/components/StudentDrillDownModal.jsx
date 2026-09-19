"use client";

import { useEffect, useState } from "react";
import { History, Loader2, Printer, User } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { CaseStatusBadge } from "./CaseStatusBadge";
import { listInterventionCases } from "../services/interventions-api";
import { formatDate, formatScore, sortCases } from "../utils/intervention-helpers";

/**
 * A learner's full intervention history across competencies.
 *
 * Completely deterministic: it is the same queue endpoint filtered to one
 * student. No Groq output is consulted here.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {object} props.student - `{ id, learner_id, full_name, section_name }`
 * @param {string|null} [props.currentCaseId]
 * @param {() => void} props.onClose
 * @param {(report: object) => void} [props.onPrint] - Opens the print/PDF report
 */
export function StudentDrillDownModal({ open, student, currentCaseId = null, onClose, onPrint }) {
  const [history, setHistory] = useState(() => ({
    ready: false,
    cases: [],
    error: null,
    key: null,
  }));

  // Identifies whose history is loaded. Without it, the previous learner's
  // cases and educator notes would stay on screen under the new learner's
  // heading for as long as the new request takes.
  const requestKey = open && student?.id ? `${student.id}|${currentCaseId ?? ""}` : null;

  useEffect(() => {
    if (!requestKey || !student?.id) return undefined;
    let cancelled = false;
    listInterventionCases({ studentId: student.id, pageSize: 100 }).then((result) => {
      if (cancelled) return;
      if (result.ok && Array.isArray(result.data)) {
        setHistory({ ready: true, cases: sortCases(result.data), error: null, key: requestKey });
      } else {
        setHistory({
          ready: true,
          cases: [],
          error: result.error ?? "Could not load this learner's intervention history.",
          key: requestKey,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [requestKey, student?.id]);

  // Anything other than this learner's own reply reads as still loading.
  const current =
    history.key === requestKey ? history : { ready: false, cases: [], error: null };
  const loading = !current.ready;
  const error = current.error;
  const cases = current.cases;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setHistory({ ready: false, cases: [], error: null, key: null });
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {student.full_name ?? "Unknown learner"} — intervention history
          </DialogTitle>
          <DialogDescription>
            {student.learner_id ? `${student.learner_id} · ` : ""}
            {student.section_name ? `Section ${student.section_name}` : "Unassigned section"}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {loading ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Loading intervention history...
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {!loading && !error && cases.length === 0 ? (
            <p className="rounded-xl border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No intervention cases on record for this learner.
            </p>
          ) : null}

          {!loading && !error && cases.length > 0 ? (
            <>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    onPrint?.({
                      kind: "history",
                      student,
                      competency: null,
                      cases,
                      title: "Intervention History Report",
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-muted/40"
                >
                  <Printer aria-hidden="true" className="size-3.5" />
                  Print history
                </button>
              </div>
              <ol className="relative space-y-4 border-l border-border pl-4">
              {cases.map((item) => (
                <li key={item.id} className="relative">
                  <span aria-hidden="true" className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-card bg-primary" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CaseStatusBadge kind="severity" value={item.severity} />
                      <CaseStatusBadge kind="status" value={item.status} />
                      {item.id === currentCaseId ? (
                        <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                          Current case
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                  <h5 className="mt-1.5 text-sm font-semibold text-foreground">
                    {item.competency.name}
                    {item.competency.code ? (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        ({item.competency.code})
                      </span>
                    ) : null}
                  </h5>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Diagnostic <strong className="tabular-nums text-foreground">{formatScore(item.evidence.diagnostic_score)}</strong>
                    </span>
                    <span>
                      Current <strong className="tabular-nums text-foreground">{formatScore(item.evidence.current_score)}</strong>
                    </span>
                    <span>
                      {item.evidence.unsuccessful_attempts} unsuccessful attempt{item.evidence.unsuccessful_attempts === 1 ? "" : "s"}
                    </span>
                    {item.intervention_type ? <span>{item.intervention_type}</span> : null}
                    {item.recorded_by ? (
                      <span className="inline-flex items-center gap-1">
                        <User aria-hidden="true" className="size-3" />
                        {item.recorded_by}
                      </span>
                    ) : null}
                  </div>
                  {item.educator_notes ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-foreground/90">{item.educator_notes}</p>
                  ) : null}
                  {item.reopen_reason ? (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      Reopened: {item.reopen_reason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            </>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}