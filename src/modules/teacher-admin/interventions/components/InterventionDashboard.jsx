"use client";

import { useCallback, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { useInterventionQueue } from "../hooks/useInterventionQueue";
import { useInterventionActions } from "../hooks/useInterventionActions";
import { InterventionFilters } from "./InterventionFilters";
import { InterventionCaseTable } from "./InterventionCaseTable";
import { InterventionReviewModal } from "./InterventionReviewModal";

/**
 * Teacher Intervention Dashboard.
 *
 * The queue, filters, and every score are deterministic and render without any
 * AI dependency. AI is advisory only and would be layered on later; its absence
 * changes nothing here.
 *
 * @param {object} props
 * @param {Array<object>} props.initialCases
 * @param {Array<object>} props.grades
 * @param {Array<object>} props.sections
 * @param {Array<object>} props.competencies
 * @param {string} [props.initialError]
 */
export function InterventionDashboard({
  initialCases = [],
  grades = [],
  sections = [],
  competencies = [],
  initialError = undefined,
}) {
  const [reviewingId, setReviewingId] = useState(null);
  const queue = useInterventionQueue(initialCases);
  const actions = useInterventionActions();

  const reviewingCase = queue.cases.find((item) => item.id === reviewingId) || null;

  const handleReview = useCallback((interventionId) => {
    setReviewingId(interventionId);
  }, []);

  const handleCloseReview = useCallback(() => {
    setReviewingId(null);
  }, []);

  const handleRecorded = useCallback(
    (updated) => {
      queue.applyCase(updated);
      queue.refresh();
    },
    [queue]
  );

  const pageError = queue.error ?? initialError;

  return (
    <div className="flex flex-col gap-6">
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
          actions for students who need support.
        </p>
      </header>

      <InterventionFilters
        filters={queue.filters}
        onChange={queue.setFilter}
        competencies={competencies}
        grades={grades}
        sections={sections}
        disabled={queue.loading}
        cases={queue.cases}
      />

      <InterventionCaseTable
        cases={queue.cases}
        onReview={handleReview}
        loading={queue.loading}
        error={pageError}
      />

      <InterventionReviewModal
        caseItem={reviewingCase}
        actions={actions}
        onClose={handleCloseReview}
        onRecorded={handleRecorded}
      />
    </div>
  );
}