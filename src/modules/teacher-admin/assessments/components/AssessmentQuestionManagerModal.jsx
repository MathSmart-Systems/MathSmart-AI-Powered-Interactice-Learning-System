"use client";

import { useCallback } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuestionMembershipManager } from "@/modules/shared";

import {
  getAssessment,
  listQuestions,
  replaceAssessmentQuestions,
} from "../services/assessment-admin-service.js";

/**
 * Choosing an assessment's questions, and the order they are delivered in.
 *
 * The body is the shared membership editor, which the activity workspace uses
 * too. Moving to it fixed three things this dialog had wrong.
 *
 * It built its question lookup from the current page of the bank alone, so an
 * assessment longer than one page rendered mostly as "this question is not on
 * the current page of the question bank" — while still asking the teacher to
 * reorder it — and searching the bank made almost all of it disappear. The
 * chosen list is read with its questions now.
 *
 * A membership read that came back without a list was treated as an empty one,
 * so a save could replace a real set with whatever was on screen. That path
 * disables saving instead.
 *
 * And the reorder buttons disabled themselves at the ends, which drops keyboard
 * focus to the document body, named the position rather than the question, and
 * announced nothing.
 */
export function AssessmentQuestionManagerModal({ open, onOpenChange, onSaved, assessment }) {
  const assessmentId = assessment?.assessment_id ?? null;

  const loadMembership = useCallback(() => getAssessment(assessmentId), [assessmentId]);

  const saveMembership = useCallback(
    (questionIds) => replaceAssessmentQuestions(assessmentId, questionIds),
    [assessmentId],
  );

  // Publication is refused until every question in the set is published, so
  // offering drafts here would only build a set that cannot ship.
  const loadQuestions = useCallback(
    ({ search, page }) => listQuestions({ search, page, status: "published" }),
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Questions</DialogTitle>
          <DialogDescription>
            {assessment?.title
              ? `Choose the questions in ${assessment.title}, and the order learners answer them in.`
              : "Choose the questions in this assessment, and the order learners answer them in."}
          </DialogDescription>
        </DialogHeader>

        {assessment ? (
          <QuestionMembershipManager
            key={assessmentId}
            subject="assessment"
            headingId="assessment-membership-heading"
            loadMembership={loadMembership}
            saveMembership={saveMembership}
            loadQuestions={loadQuestions}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
