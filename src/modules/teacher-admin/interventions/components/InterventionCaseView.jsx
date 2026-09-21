"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, History, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

import { AIInsightPanel } from "./AIInsightPanel";
import { CaseStatusBadge } from "./CaseStatusBadge";
import { InterventionRecordForm } from "./InterventionRecordForm";
import { CaseToast } from "./CaseToast";
import { ReportPrintPane } from "./ReportPrintPane";
import { StudentDrillDownModal } from "./StudentDrillDownModal";
import { useInterventionActions } from "../hooks/useInterventionActions";
import { formatScore, queueHref, suggestionNoteDraft } from "../utils/intervention-helpers";

/** The severity a case carries, as a rule down the left of its header. */
const SEVERITY_RULE = {
  HIGH: "border-destructive",
  MEDIUM: "border-primary",
  LOW: "border-border",
};

function EvidenceStat({ label, value, tone = "default" }) {
  return (
    <div>
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      <span
        className={`text-lg font-semibold tabular-nums ${
          tone === "problem" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function EvidenceList({ title, icon: Icon, items, empty, tone = "default" }) {
  const list = Array.isArray(items) ? items : [];

  return (
    <section
      className={`rounded-xl border p-4 ${
        tone === "problem" ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"
      }`}
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon
          aria-hidden="true"
          className={`size-4 ${tone === "problem" ? "text-destructive" : "text-primary"}`}
        />
        {title}
      </h3>
      {list.length > 0 ? (
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
          {list.map((item, index) => (
            <li key={index} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

/**
 * One intervention case, as a page.
 *
 * This used to be a dialog, and it had outgrown one: a case carries evidence,
 * recurring mistakes, modules attempted, an advisory suggestion, a history and
 * a form, which is more than a box on top of a list can hold without becoming
 * a second page with worse scrolling.
 *
 * Two entry points lead here and they arrive differently. "Review" lands at the
 * top, on the evidence that explains why the case exists. "Record action"
 * lands on the form, scrolls it into view and puts the cursor in it — same
 * page, same data, no second control that quietly does the same thing.
 *
 * The queue the teacher came from travels in the address, so the way back is
 * the queue they left rather than an unfiltered one.
 *
 * @param {object} props
 * @param {object} props.caseDetail - The case, read on the server
 * @param {object} props.filters - The queue filters to return to
 * @param {"record"|null} [props.at] - Which part of the page to arrive at
 */
export function InterventionCaseView({ caseDetail: initialDetail, filters, at = null }) {
  const router = useRouter();
  const actions = useInterventionActions(initialDetail);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [printReport, setPrintReport] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [toast, setToast] = useState(null);
  const recordRef = useRef(null);

  const caseDetail = actions.caseDetail ?? initialDetail;
  const student = caseDetail?.student ?? {};
  const competency = caseDetail?.competency ?? {};
  const evidence = caseDetail?.evidence ?? {};
  const backHref = queueHref(filters);

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

  /**
   * Arriving to record an action puts the teacher in the form.
   *
   * Scrolling alone would leave a keyboard user at the top of the document with
   * the form merely in sight, so focus moves too. Both are DOM work rather than
   * state, and they run once for the arrival that asked for them.
   */
  useEffect(() => {
    if (at !== "record" || !recordRef.current) return;
    recordRef.current.scrollIntoView({ block: "start", behavior: "auto" });
    const field = recordRef.current.querySelector(
      'button[aria-pressed], textarea, select, input',
    );
    field?.focus({ preventScroll: true });
  }, [at]);

  const useSuggestionAsNote = useCallback(() => {
    setNoteDraft(suggestionNoteDraft(caseDetail));
  }, [caseDetail]);

  /**
   * Adds one line of the plan to whatever the teacher has already written.
   *
   * Appending rather than replacing, because taking a second strategy should
   * not throw away the first — or throw away a sentence the teacher typed
   * themselves before reading the suggestion.
   */
  const takeSuggestionLine = useCallback((line) => {
    if (!line) return;
    setNoteDraft((current) => (current ? `${current.trimEnd()} ${line}` : line).slice(0, 4000));
  }, []);

  const caseId = caseDetail?.id ?? null;
  const handleResolve = useCallback(async () => {
    if (!caseId) return;
    const updated = await actions.setCaseStatus(caseId, "Resolved");
    // The queue behind this page is a server read, so it needs telling.
    if (updated) router.refresh();
  }, [actions, caseId, router]);

  if (!caseDetail) return null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-2 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to the intervention queue
      </Link>

      <header
        className={`border-l-[3px] pl-4 ${SEVERITY_RULE[caseDetail.severity] ?? SEVERITY_RULE.LOW}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {student.full_name ?? "Unknown learner"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {student.section_name ? `Section ${student.section_name}` : "No section"} ·{" "}
              {competency.name ?? "Competency"}
              {competency.code ? ` (${competency.code})` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CaseStatusBadge kind="severity" value={caseDetail.severity} />
              <CaseStatusBadge kind="status" value={caseDetail.status} />
              {caseDetail.recorded_by ? (
                <span className="text-xs text-muted-foreground">
                  Last recorded by {caseDetail.recorded_by}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Only a case that has been taken up can be resolved, which the
                database enforces, so the page never offers the move a server
                would refuse. Reopening is not here: it needs a written reason,
                and that belongs in the form. */}
            {caseDetail.status === "In Progress" ? (
              <Button type="button" size="sm" onClick={handleResolve} disabled={actions.saving}>
                <CheckCircle2 aria-hidden="true" className="size-4" />
                {actions.saving ? "Marking resolved…" : "Mark resolved"}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setHistoryOpen(true)}
              disabled={!student.id}
            >
              <History aria-hidden="true" className="size-4" />
              Student history
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setPrintReport({
                  kind: "case",
                  student,
                  competency,
                  cases: [caseDetail],
                  title: "Intervention Case Report",
                })
              }
            >
              <Printer aria-hidden="true" className="size-4" />
              Print report
            </Button>
          </div>
        </div>
      </header>

      {actions.saveError ? (
        <p
          role="alert"
          className="rounded-lg border-l-[3px] border-destructive bg-destructive/5 px-3 py-2 text-sm text-foreground"
        >
          {actions.saveError}
        </p>
      ) : null}

      <section
        aria-labelledby="case-evidence-heading"
        className="rounded-xl border border-border bg-secondary/30 p-4"
      >
        <h2 id="case-evidence-heading" className="text-sm font-semibold text-foreground">
          Evidence behind this case
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-x-10 gap-y-4">
          <EvidenceStat label="Diagnostic baseline" value={formatScore(evidence.diagnostic_score)} />
          <EvidenceStat label="Current score" value={formatScore(evidence.current_score)} />
          <EvidenceStat label="Scored attempts" value={evidence.attempt_count ?? 0} />
          <EvidenceStat
            label="Unsuccessful attempts"
            value={evidence.unsuccessful_attempts ?? 0}
            tone={evidence.unsuccessful_attempts > 0 ? "problem" : "default"}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EvidenceList
          title="Recurring incorrect answers"
          icon={AlertTriangle}
          items={caseDetail.incorrect_patterns}
          empty="No incorrect-answer patterns have been recorded for this case."
          tone="problem"
        />
        <EvidenceList
          title="Modules attempted"
          icon={BookOpen}
          items={caseDetail.modules_attempted}
          empty="This learner has not attempted a module for this competency yet."
        />
      </div>

      <AIInsightPanel
        detail={caseDetail}
        onDetailChange={actions.applyDetail}
        onUseAsNote={useSuggestionAsNote}
        onTakeLine={takeSuggestionLine}
        // A failed suggestion is told, not shown in the panel's own space: the
        // plan the teacher was reading has to stay where it was.
        onFailure={(message) => setToast({ tone: "error", message })}
      />

      <div ref={recordRef} id="record-action" className="scroll-mt-6">
        <InterventionRecordForm
          onSubmit={async (payload) => {
            const saved = await actions.recordAction(caseDetail.id, payload);
            if (saved) {
              setToast({
                tone: "success",
                message: "Intervention recorded to the learner's case history.",
              });
              router.refresh();
            }
            return saved;
          }}
          currentStatus={caseDetail.status}
          notes={noteDraft}
          onNotesChange={setNoteDraft}
          saving={actions.saving}
          error={actions.saveError}
        />
      </div>

      <StudentDrillDownModal
        open={historyOpen}
        student={student}
        currentCaseId={caseDetail.id}
        onClose={() => setHistoryOpen(false)}
        onPrint={setPrintReport}
      />

      <CaseToast toast={toast} onDismiss={() => setToast(null)} />

      <ReportPrintPane report={printReport} />
    </div>
  );
}
