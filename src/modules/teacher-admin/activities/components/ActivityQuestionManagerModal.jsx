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
  getActivity,
  listQuestions,
  replaceActivityQuestions,
} from "../services/activity-admin-service.js";

/**
 * Choosing an activity's questions, and the order a learner meets them in.
 *
 * Activities had no way to author this at all. The membership table, its
 * grants and its policies were written with the schema and nothing ever used
 * them, so an activity's questions could only be set outside the application —
 * and the teacher workspace offered an activity with no practice in it and no
 * way to say otherwise.
 *
 * The body is the shared membership editor, which the assessment workspace
 * uses too. The contract is the same on both sides: the whole list is replaced
 * in one transaction and the position of each question is its place in it.
 */
export function ActivityQuestionManagerModal({ open, onOpenChange, onSaved, activity }) {
  const activityId = activity?.activity_id ?? null;

  const loadMembership = useCallback(() => getActivity(activityId), [activityId]);

  const saveMembership = useCallback(
    (questionIds) => replaceActivityQuestions(activityId, questionIds),
    [activityId],
  );

  // Only published questions can be attached to something a learner will be
  // given: publication is refused until every question in the set is
  // published, so offering drafts here would only build a set that cannot ship.
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
            {activity?.title
              ? `Choose the questions in ${activity.title}, and the order learners answer them in.`
              : "Choose the questions in this activity, and the order learners answer them in."}
          </DialogDescription>
        </DialogHeader>

        {activity ? (
          <QuestionMembershipManager
            key={activityId}
            subject="activity"
            headingId="activity-membership-heading"
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
