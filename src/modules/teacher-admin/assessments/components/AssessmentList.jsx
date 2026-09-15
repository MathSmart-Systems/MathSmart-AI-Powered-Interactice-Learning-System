"use client";

import { useRef } from "react";
import { Archive, ListOrdered, PencilLine, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  formatAssessmentType,
  formatDate,
  formatDuration,
  formatQuestionCount,
} from "../utils/format.js";

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
function StatusTabs({ value, onChange, panelId }) {
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
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** What a row looks like before its data arrives. */
function LoadingRows() {
  return (
    <ul className="divide-y divide-border border border-border bg-card">
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex flex-col gap-3 px-5 py-5">
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
 */
export function AssessmentList({
  assessments = [],
  gradeNames = {},
  isLoading = false,
  hasFilter = false,
  panelId,
  labelledBy,
  onEdit,
  onManageQuestions,
  onPublish,
  onArchive,
  onCreateDraft,
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
          {hasFilter ? null : (
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
          const gradeName = gradeNames[assessment.grade_id];

          return (
            <li
              key={assessment.assessment_id}
              className="flex flex-col gap-4 px-5 py-5 sm:px-6"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
                    {assessment.title}
                  </h3>
                  <AssessmentStatusBadge status={assessment.status} />
                </div>

                {assessment.description ? (
                  <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                    {assessment.description}
                  </p>
                ) : null}

                <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <div className="flex gap-1.5">
                    <dt className="sr-only">Type</dt>
                    <dd>{formatAssessmentType(assessment.assessment_type)}</dd>
                  </div>
                  {gradeName ? (
                    <div className="flex gap-1.5">
                      <dt className="sr-only">Grade level</dt>
                      <dd>{gradeName}</dd>
                    </div>
                  ) : null}
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

                {status === "archived" ? null : (
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
