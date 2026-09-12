"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  DEFAULT_PAGE_SIZE,
  listAssessments,
  listGrades,
} from "../services/assessment-admin-service.js";

import { AssessmentArchiveDialog } from "./AssessmentArchiveDialog.jsx";
import { AssessmentFormModal } from "./AssessmentFormModal.jsx";
import { AssessmentList, STATUS_TABS, StatusTabs } from "./AssessmentList.jsx";
import { AssessmentPublishDialog } from "./AssessmentPublishDialog.jsx";
import { AssessmentQuestionManagerModal } from "./AssessmentQuestionManagerModal.jsx";

const SEARCH_DEBOUNCE_MS = 300;
const CONFIRMATION_MS = 6000;
const PANEL_ID = "assessment-list-panel";

/** Which dialog is open, and the row it was opened for. */
const NO_DIALOG = { kind: null, assessment: null };

/**
 * Assessment administration.
 *
 * One page of assessments at a time: searching, status filtering and paging are
 * the API's work, because a teacher with more assessments than one page holds
 * would otherwise be searching only the rows that happened to load.
 */
export function TeacherAssessmentsView() {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [reloadIndex, setReloadIndex] = useState(0);

  const [assessments, setAssessments] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [grades, setGrades] = useState([]);
  const [dialog, setDialog] = useState(NO_DIALOG);
  const [confirmation, setConfirmation] = useState(null);

  const confirmationTimer = useRef(null);

  /** A confirmation that clears itself, and never outlives the component. */
  const confirm = useCallback((message) => {
    setConfirmation(message);
    clearTimeout(confirmationTimer.current);
    confirmationTimer.current = setTimeout(() => setConfirmation(null), CONFIRMATION_MS);
  }, []);

  useEffect(() => () => clearTimeout(confirmationTimer.current), []);

  const reload = useCallback(() => setReloadIndex((index) => index + 1), []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      const result = await listAssessments({
        search: appliedSearch,
        status: status === "all" ? null : status,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
      });

      if (!active) {
        return;
      }

      if (result.ok) {
        setAssessments(result.data);
        setMeta(result.meta);
        setError(null);
      } else {
        setError(result.error);
      }
      setIsLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [appliedSearch, status, page, reloadIndex]);

  useEffect(() => {
    let active = true;

    async function load() {
      const result = await listGrades();
      if (active && result.ok) {
        setGrades(result.data);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const gradeNames = {};
  for (const grade of grades) {
    gradeNames[grade.grade_id] = grade.name;
  }

  function openDialog(kind, assessment = null) {
    setDialog({ kind, assessment });
  }

  function closeDialog(open) {
    if (!open) {
      setDialog(NO_DIALOG);
    }
  }

  function handleStatusChange(next) {
    setStatus(next);
    setPage(1);
  }

  const totalItems = meta?.totalItems ?? assessments.length;
  const totalPages = meta?.totalPages ?? 1;
  const hasFilter = Boolean(appliedSearch) || status !== "all";
  const selectedTab = STATUS_TABS.find((tab) => tab.value === status) ?? STATUS_TABS[0];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Teacher and Administrator</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Assessments
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Author Grade 6 assessments, choose the questions they hold, and publish them when
          they are ready for learners.
        </p>
      </header>

      {/* Announced, not just shown: a teacher who saved with the keyboard is not
          necessarily looking at the top of the page. */}
      <div aria-live="polite" className="sr-only">
        {confirmation}
      </div>
      {confirmation ? (
        <p className="border-l-[3px] border-primary bg-card px-5 py-4 text-sm leading-relaxed text-foreground">
          {confirmation}
        </p>
      ) : null}

      {error ? (
        <section
          aria-labelledby="assessments-error-heading"
          className="flex flex-col gap-4 border-l-[3px] border-destructive bg-destructive/5 px-5 py-5"
        >
          <div className="flex items-center gap-2.5 text-destructive">
            <TriangleAlert aria-hidden="true" className="size-4" />
            <h2 id="assessments-error-heading" className="text-base font-semibold">
              Assessments could not be loaded
            </h2>
          </div>
          <p className="max-w-prose text-sm leading-relaxed text-foreground">{error}</p>
          <div>
            <Button type="button" variant="outline" className="h-11 px-5" onClick={reload}>
              <RotateCw aria-hidden="true" />
              Try again
            </Button>
          </div>
        </section>
      ) : null}

      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-64 flex-1 flex-col gap-2">
            <Label htmlFor="assessment-search">Search assessments</Label>
            <Input
              id="assessment-search"
              type="search"
              value={search}
              placeholder="Search by title"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <Button type="button" className="h-11 px-5" onClick={() => openDialog("form")}>
            <Plus aria-hidden="true" />
            New assessment
          </Button>
        </div>

        <StatusTabs value={status} onChange={handleStatusChange} panelId={PANEL_ID} />

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {isLoading
            ? "Loading assessments…"
            : `${totalItems} ${totalItems === 1 ? "assessment" : "assessments"}${
                status === "all" ? "" : ` in ${selectedTab.label.toLowerCase()}`
              }${appliedSearch ? ` matching “${appliedSearch}”` : ""}`}
        </p>

        <AssessmentList
          assessments={assessments}
          gradeNames={gradeNames}
          isLoading={isLoading}
          hasFilter={hasFilter}
          panelId={PANEL_ID}
          labelledBy={`assessment-status-tab-${status}`}
          onCreateDraft={() => openDialog("form")}
          onEdit={(assessment) => openDialog("form", assessment)}
          onManageQuestions={(assessment) => openDialog("questions", assessment)}
          onPublish={(assessment) => openDialog("publish", assessment)}
          onArchive={(assessment) => openDialog("archive", assessment)}
        />

        {totalPages > 1 ? (
          <nav aria-label="Assessment pages" className="flex items-center justify-between gap-4">
            <Button
              type="button"
              variant="outline"
              className="h-11 px-5"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-11 px-5"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </nav>
        ) : null}
      </div>

      <AssessmentFormModal
        open={dialog.kind === "form"}
        onOpenChange={closeDialog}
        assessment={dialog.assessment}
        grades={grades}
        onSaved={(saved, action) => {
          setDialog(NO_DIALOG);
          confirm(
            action === "created"
              ? `${saved.title} was created as a draft. Add its questions next.`
              : `${saved.title} was saved.`
          );
          reload();
        }}
      />

      <AssessmentQuestionManagerModal
        open={dialog.kind === "questions"}
        onOpenChange={closeDialog}
        assessment={dialog.assessment}
        onSaved={(saved) => {
          setDialog(NO_DIALOG);
          confirm(
            `The question list was saved. This assessment now holds ${saved.question_count} ${
              saved.question_count === 1 ? "question" : "questions"
            }.`
          );
          reload();
        }}
      />

      <AssessmentPublishDialog
        open={dialog.kind === "publish"}
        onOpenChange={closeDialog}
        assessment={dialog.assessment}
        onPublished={(published) => {
          setDialog(NO_DIALOG);
          confirm(`${published.title} is published and can be delivered to learners.`);
          reload();
        }}
      />

      <AssessmentArchiveDialog
        open={dialog.kind === "archive"}
        onOpenChange={closeDialog}
        assessment={dialog.assessment}
        onArchived={(archived) => {
          setDialog(NO_DIALOG);
          confirm(`${archived.title} was archived. It is no longer delivered to learners.`);
          reload();
        }}
      />
    </div>
  );
}
