"use client";

import { useRef } from "react";
import {
  Archive,
  ArchiveRestore,
  ListOrdered,
  PencilLine,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { DEFAULT_PAGE_SIZE } from "../services/api-client.js";
import {
  formatAssessmentType,
  formatDate,
  formatDuration,
  formatQuestionCount,
} from "../utils/format.js";

import { describeAssessmentReadiness } from "../utils/readiness.js";

import { AssessmentReadinessBadge, AssessmentReadinessNote } from "./AssessmentReadiness.jsx";
import { AssessmentStatusBadge } from "./AssessmentStatusBadge.jsx";

/** The status tabs, in the order an author works through them. */
export const STATUS_TABS = Object.freeze([
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
]);

/**
 * The status filter, as a real tab list.
 *
 * Arrow keys move between tabs and only the selected tab is in the tab order,
 * which is what `role="tablist"` promises a keyboard user. A row of buttons
 * styled to look like tabs promises the same thing and then does not do it.
 */
function StatusTabs({ value, onChange, panelId, counts = null }) {
  const tabsRef = useRef([]);

  function handleKeyDown(event) {
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" };
    const move = keys[event.key];
    if (move === undefined) {
      return;
    }

    event.preventDefault();
    const current = STATUS_TABS.findIndex((tab) => tab.value === value);
    let next;
    if (move === "first") {
      next = 0;
    } else if (move === "last") {
      next = STATUS_TABS.length - 1;
    } else {
      next = (current + move + STATUS_TABS.length) % STATUS_TABS.length;
    }

    onChange(STATUS_TABS[next].value);
    tabsRef.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Filter assessments by publication status"
      className="flex flex-wrap gap-1 border-b border-border"
      onKeyDown={handleKeyDown}
    >
      {STATUS_TABS.map((tab, index) => {
        const isSelected = tab.value === value;
        // `typeof`, not truthiness: a state holding nothing still has a count,
        // and hiding the badge made an empty state look uncounted.
        const total = counts ? counts[tab.value] : undefined;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              tabsRef.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`assessment-status-tab-${tab.value}`}
            aria-selected={isSelected}
            aria-controls={panelId}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={
              isSelected
                ? "-mb-px min-h-11 border-b-2 border-primary px-3 text-sm font-semibold text-foreground"
                : "-mb-px min-h-11 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            }
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {typeof total === "number" ? (
                <span
                  className={
                    isSelected
                      ? "rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground tabular-nums"
                      : "rounded-full bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground tabular-nums"
                  }
                >
                  {total}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * What a row looks like before its data arrives.
 *
 * It reserves a page of them rather than three, so the list does not grow by
 * seventeen rows the moment the read resolves.
 */
function LoadingRows({ rows = DEFAULT_PAGE_SIZE }) {
  return (
    <ul className="divide-y divide-border border border-border bg-card">
      <li className="sr-only" role="status">
        Loading assessments
      </li>
      {Array.from({ length: rows }).map((_, row) => (
        <li key={row} className="flex animate-pulse flex-col gap-3 px-5 py-5 motion-reduce:animate-none">
          <div className="h-4 w-2/5 bg-muted" />
          <div className="h-3 w-3/5 bg-muted" />
          <div className="h-3 w-1/4 bg-muted" />
        </li>
      ))}
    </ul>
  );
}

/**
 * The assessments on this page.
 *
 * Searching and status filtering happen on the server, so this component
 * renders exactly the page it was given. Filtering here instead would quietly
 * hide every assessment on the pages that were not fetched.
 *
 * `publishRefusal` is the last refusal the API gave for one of these rows,
 * carried down so the reason survives the dialog the teacher dismissed. It
 * names a single row, because a teacher publishes one paper at a time.
 */
export function AssessmentList({
  assessments = [],
  isLoading = false,
  hasFilter = false,
  publishRefusal = null,
  panelId,
  labelledBy,
  onEdit,
  onUnpublish,
  onManageQuestions,
  onPublish,
  onArchive,
  onRestore,
  onDelete,
  onCreateDraft,
  onClearFilter,
}) {
  if (isLoading) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} aria-busy="true">
        <p className="sr-only">Loading assessments</p>
        <LoadingRows />
      </div>
    );
  }

  if (assessments.length === 0) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} tabIndex={-1}>
        <div className="flex flex-col items-start gap-4 border-l-[3px] border-border bg-card px-5 py-5">
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            {hasFilter
              ? "No assessment matches this search and status. Clear the search, or choose another status, to see the rest."
              : "No assessment has been authored yet. Create the first draft, add its questions, then publish it when it is ready for learners."}
          </p>
          {hasFilter ? (
            <Button type="button" variant="outline" className="h-11 px-5" onClick={onClearFilter}>
              Clear the filters
            </Button>
          ) : (
            <Button type="button" className="h-11 px-5" onClick={onCreateDraft}>
              Create the first assessment
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} tabIndex={-1}>
      <ul className="divide-y divide-border border border-border bg-card">
        {assessments.map((assessment) => {
          const status = (assessment.status || "draft").toLowerCase();
          const questionCount = assessment.question_count ?? 0;
          const readiness = describeAssessmentReadiness(assessment);
          const refusal =
            publishRefusal?.assessmentId === assessment.assessment_id
              ? publishRefusal.message
              : null;

          return (
            <li
              key={assessment.assessment_id}
              className="flex flex-col gap-4 px-5 py-5 sm:px-6"
            >
              <div className="flex flex-col gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  <h3 className="font-display text-base font-semibold tracking-tight break-words text-foreground">
                    {assessment.title}
                  </h3>
                  <AssessmentStatusBadge status={assessment.status} />
                  {/*
                    Readiness is a second badge and a line beneath, not a
                    rewrite of the first badge. Published and ready are two
                    separate facts: a paper that was published is being offered
                    to learners right now, which is exactly why an unready one
                    is worth interrupting for, so overwriting "Published" with
                    "Not ready" would hide the urgency rather than explain it.
                    The badge is what makes the row findable in a list of
                    twenty, and a badge has no room for which dependency is
                    missing — so the sentence that names it, and the control
                    that fixes it, go underneath where there is room for both.
                  */}
                  {readiness ? <AssessmentReadinessBadge /> : null}
                </div>

                {assessment.description ? (
                  <p className="max-w-prose text-sm leading-relaxed break-words text-muted-foreground">
                    {assessment.description}
                  </p>
                ) : null}

                <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <div className="flex gap-1.5">
                    <dt className="sr-only">Type</dt>
                    <dd>{formatAssessmentType(assessment.assessment_type)}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="sr-only">Questions</dt>
                    <dd>{formatQuestionCount(questionCount)}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="sr-only">Time limit</dt>
                    <dd>{formatDuration(assessment.duration_minutes)}</dd>
                  </div>
                  {assessment.updated_at ? (
                    <div className="flex gap-1.5">
                      <dt>Updated</dt>
                      <dd>{formatDate(assessment.updated_at)}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              {/*
                A refusal outranks the row's own reading of readiness. The
                server checked this assessment a moment ago and named the one
                condition that failed; `is_ready` only knows that one of them
                did. Both lead to the same place, so the same note carries both.
              */}
              {refusal ? (
                <AssessmentReadinessNote
                  headline="It could not be published"
                  detail={refusal}
                  title={assessment.title}
                  onFix={
                    onManageQuestions ? () => onManageQuestions(assessment) : undefined
                  }
                />
              ) : readiness ? (
                <AssessmentReadinessNote
                  headline={readiness.headline}
                  detail={readiness.detail}
                  title={assessment.title}
                  onFix={
                    onManageQuestions ? () => onManageQuestions(assessment) : undefined
                  }
                />
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 sm:min-h-9"
                  onClick={() => onManageQuestions(assessment)}
                >
                  <ListOrdered aria-hidden="true" />
                  Questions
                  <span className="sr-only"> in {assessment.title}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 sm:min-h-9"
                  onClick={() => onEdit(assessment)}
                >
                  <PencilLine aria-hidden="true" />
                  Edit
                  <span className="sr-only"> {assessment.title}</span>
                </Button>

                {status === "draft" ? (
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 sm:min-h-9"
                    onClick={() => onPublish(assessment)}
                  >
                    <Send aria-hidden="true" />
                    Publish
                    <span className="sr-only"> {assessment.title}</span>
                  </Button>
                ) : null}

                {/*
                  Publishing used to be a one-way door: a paper with a wrong
                  passing mark, or one published a week early, could only be
                  archived — which reads as "finished with" rather than "not
                  yet" and hides it from the list a teacher works in.
                */}
                {status === "published" && onUnpublish ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 sm:min-h-9"
                    onClick={() => onUnpublish(assessment)}
                  >
                    <Undo2 aria-hidden="true" />
                    Return to draft
                    <span className="sr-only"> {assessment.title}</span>
                  </Button>
                ) : null}

                {status === "archived" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 sm:min-h-9"
                      onClick={() => onRestore?.(assessment)}
                    >
                      <ArchiveRestore aria-hidden="true" />
                      Restore
                      <span className="sr-only"> {assessment.title}</span>
                    </Button>
                    {/*
                      Only on an archived row, because only an archived record
                      is in scope for removal at all. Archive stays the
                      separate, safer action; this one is reached through it.
                    */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 text-destructive hover:bg-destructive/10 hover:text-destructive sm:min-h-9"
                      onClick={() => onDelete?.(assessment)}
                    >
                      <Trash2 aria-hidden="true" />
                      Delete permanently
                      <span className="sr-only"> {assessment.title}</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 sm:min-h-9"
                    onClick={() => onArchive(assessment)}
                  >
                    <Archive aria-hidden="true" />
                    Archive
                    <span className="sr-only"> {assessment.title}</span>
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { StatusTabs };
