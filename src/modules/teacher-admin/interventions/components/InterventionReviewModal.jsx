"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, History, Loader2, Printer } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { CaseStatusBadge } from "./CaseStatusBadge";
import { InterventionRecordForm } from "./InterventionRecordForm";
import { StudentDrillDownModal } from "./StudentDrillDownModal";
import { AIInsightPanel } from "./AIInsightPanel";
import { formatScore } from "../utils/intervention-helpers";

function EvidenceStat({ label, value, tone = "default" }) {
  const toneClass =
    tone === "problem" ? "text-destructive" : tone === "new" ? "text-foreground" : "text-foreground";
  return (
    <div>
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

/**
 * Detailed review of one intervention case.
 *
 * Deterministic evidence (scores, attempts, patterns, modules) renders as soon
 * as the detail request returns. Advisory AI is layered on beneath it by
 * `AIInsightPanel`, which never blocks this evidence and fails quietly.
 *
 * @param {object} props
 * @param {object|null} props.caseItem - The summary row that opened the modal
 * @param {object} props.actions - The `useInterventionActions` return value
 * @param {() => void} props.onClose - Closes the modal for good (clears selection)
 * @param {(updated: object) => void} [props.onRecorded] - Called after a save
 * @param {(report: object) => void} [props.onPrint] - Opens the print/PDF report
 */
export function InterventionReviewModal({ caseItem, actions, onClose, onRecorded, onPrint }) {
  const {
    caseDetail,
    loadingDetail,
    detailError,
    saving,
    saveError,
    openCase,
    closeCase,
    recordAction,
  } = actions;

  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (caseItem?.id) {
      openCase(caseItem.id);
    }
  }, [caseItem?.id, openCase]);

  const summary = caseItem ?? {};
  const student = caseDetail?.student ?? summary.student ?? {};
  const competency = summary.competency ?? {};
  const evidence = (caseDetail?.evidence ?? summary.evidence ?? {});

  return (
    <Dialog
      open={Boolean(caseItem)}
      onOpenChange={(open) => {
        if (!open) {
          closeCase();
          onClose?.();
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Remediation case: {student.full_name ?? "Unknown learner"}</DialogTitle>
          <DialogDescription>
            {competency.name ?? "Competency"} {competency.code ? `(${competency.code})` : ""}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {loadingDetail ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Loading case evidence...
            </p>
          ) : null}

          {detailError ? (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {detailError}
            </p>
          ) : null}

          {!loadingDetail && !detailError && caseDetail ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 p-4 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <span className="block text-[11px] text-muted-foreground">Section</span>
                    <span className="font-bold text-foreground">
                      {student.section_name ? `Section ${student.section_name}` : "Unassigned"}
                    </span>
                  </div>
                  <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />
                  <EvidenceStat label="Diagnostic baseline" value={formatScore(evidence.diagnostic_score)} />
                  <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />
                  <EvidenceStat label="Current score" value={formatScore(evidence.current_score)} tone="new" />
                  <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />
                  <EvidenceStat
                    label="Unsuccessful attempts"
                    value={evidence.unsuccessful_attempts}
                    tone={evidence.unsuccessful_attempts > 0 ? "problem" : "default"}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CaseStatusBadge kind="severity" value={caseDetail?.severity ?? summary.severity} />
                  <CaseStatusBadge kind="status" value={caseDetail?.status ?? summary.status} />
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    disabled={!student.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-60"
                  >
                    <History aria-hidden="true" className="size-3.5" />
                    Student history
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onPrint?.({
                        kind: "case",
                        student,
                        competency,
                        cases: [caseDetail],
                        title: "Intervention Case Report",
                      })
                    }
                    disabled={!caseDetail}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-60"
                  >
                    <Printer aria-hidden="true" className="size-3.5" />
                    Print report
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <AlertTriangle aria-hidden="true" className="size-3.5 text-destructive" />
                    Identified incorrect-answer patterns
                  </h4>
                  {Array.isArray(caseDetail?.incorrect_patterns) && caseDetail.incorrect_patterns.length > 0 ? (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                      {caseDetail.incorrect_patterns.map((pattern, index) => (
                        <li key={index} className="leading-relaxed">{pattern}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No incorrect-answer patterns recorded.</p>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <BookOpen aria-hidden="true" className="size-3.5 text-primary" />
                    Modules attempted by learner
                  </h4>
                  {Array.isArray(caseDetail?.modules_attempted) && caseDetail.modules_attempted.length > 0 ? (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                      {caseDetail.modules_attempted.map((module, index) => (
                        <li key={index} className="leading-relaxed">{module}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No modules attempted yet.</p>
                  )}
                </div>
              </div>

              <AIInsightPanel detail={caseDetail} />

              <InterventionRecordForm
                onSubmit={async (payload) => {
                  const saved = await recordAction(caseDetail.id, payload);
                  if (saved) onRecorded?.(saved);
                  return saved;
                }}
                currentStatus={caseDetail.status}
                saving={saving}
                error={saveError}
              />
            </>
          ) : null}
        </DialogBody>
      </DialogContent>

      <StudentDrillDownModal
        open={historyOpen}
        student={student}
        currentCaseId={caseDetail?.id ?? null}
        onClose={() => setHistoryOpen(false)}
        onPrint={onPrint}
      />
    </Dialog>
  );
}