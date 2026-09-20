"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PermanentDeleteDialog, ResultAnnouncer } from "@/modules/shared";

import {
  DEFAULT_PAGE_SIZE,
  deleteAssessmentPermanently,
  listAssessments,
  readAssessmentReferences,
} from "../services/assessment-admin-service.js";

import { AssessmentArchiveDialog } from "./AssessmentArchiveDialog.jsx";
import { AssessmentFormModal } from "./AssessmentFormModal.jsx";
import { AssessmentList, STATUS_TABS, StatusTabs } from "./AssessmentList.jsx";
import { AssessmentPublishDialog } from "./AssessmentPublishDialog.jsx";
import { AssessmentUnpublishDialog } from "./AssessmentUnpublishDialog.jsx";
import { AssessmentQuestionManagerModal } from "./AssessmentQuestionManagerModal.jsx";
import { AssessmentRestoreDialog } from "./AssessmentRestoreDialog.jsx";

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

    /**
     * Loads paginated assessments from the API matching search and status.
     */
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
        // A page beyond the end comes back empty. Archiving the only row on
        // page 3 used to leave the list saying "no assessment matches this
        // search and status" under filters that matched plenty.
        const lastPage = Math.max(1, result.meta?.totalPages || 1);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setAssessments(result.data);
        setMeta(result.meta);
        setError(null);
      } else {
        // The rows that were on screen are no longer known to exist, and
        // leaving them under an error banner — with pagination still driven by
        // the last successful read — invited acting on them.
        setAssessments([]);
        setMeta(null);
        setError(result.error);
      }
      setIsLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [appliedSearch, status, page, reloadIndex]);

  /**
   * Opens a management dialog for a specific action and optional target assessment.
   *
   * @param {string} kind - Dialog type identifier
   * @param {object|null} [assessment] - Target assessment record
   */
  function openDialog(kind, assessment = null) {
    setDialog({ kind, assessment });
  }

  /**
   * Closes the active dialog when dismissed.
   *
   * @param {boolean} open - Dialog open state
   */
  function closeDialog(open) {
    if (!open) {
      setDialog(NO_DIALOG);
    }
  }

  /**
   * Updates the selected status filter tab and resets pagination.
   *
   * @param {string} next - Target status filter key
   */
  function handleStatusChange(next) {
    setStatus(next);
    setPage(1);
  }

  const totalItems = meta?.totalItems ?? assessments.length;
  const deletingId = dialog.kind === "delete" ? dialog.assessment?.assessment_id : null;

  const loadAssessmentReferences = useCallback(
    () => readAssessmentReferences(deletingId),
    [deletingId],
  );

  const confirmAssessmentDeletion = useCallback(
    () => deleteAssessmentPermanently(deletingId),
    [deletingId],
  );

  const totalPages = meta?.totalPages ?? 1;
  const hasFilter = Boolean(appliedSearch) || status !== "all";

  /**
   * Whether there is nothing on screen yet, as opposed to a list being
   * refreshed.
   *
   * Restoring an archived assessment re-reads the collection, and the skeleton
   * used to take the rows away while it did. That is a bad trade on its own —
   * a teacher loses the row they were working on, for something they just did
   * — and it also moved the page: a page of placeholder rows is shorter than a
   * page of real ones, the browser clamps a scroll offset it can no longer
   * honour, and the rows come back with the reader at the top. The skeleton is
   * for arriving with nothing; a refresh keeps what it has and says it is busy.
   */
  const isFirstLoad = isLoading && meta === null;
  const selectedTab = STATUS_TABS.find((tab) => tab.value === status) ?? STATUS_TABS[0];

  /**
   * The sentence under the tabs, and the one that gets announced.
   *
   * Declared after the two values it reads, not before them. An immediately
   * invoked expression is evaluated where it is written, so placing it above
   * `hasFilter` and `selectedTab` put both in the temporal dead zone and threw
   * on the first render of the whole workspace.
   */
  const caption = (() => {
    if (isFirstLoad) {
      return "Loading assessments…";
    }
    if (error) {
      return "Assessments could not be loaded.";
    }
    if (!totalItems) {
      return hasFilter ? "No assessments match these filters" : "No assessments yet";
    }
    const first = (page - 1) * DEFAULT_PAGE_SIZE + 1;
    const last = Math.min(first + assessments.length - 1, totalItems);
    const scope =
      status === "all" ? "assessments" : `${selectedTab.label.toLowerCase()} assessments`;
    return `Showing ${first}–${last} of ${totalItems} ${scope}${
      appliedSearch ? ` matching “${appliedSearch}”` : ""
    }`;
  })();

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

        <StatusTabs
          value={status}
          onChange={handleStatusChange}
          panelId={PANEL_ID}
          counts={meta?.statusCounts ?? null}
        />

        <p className="text-sm text-muted-foreground">{caption}</p>
        <ResultAnnouncer message={isFirstLoad ? "" : caption} />

        {/*
          A small, fixed-height indicator beside the list rather than a page of
          placeholders. It keeps its space whether or not it is showing
          anything, so the list does not move by a line when a refresh starts
          and again when it ends — which is its own way of losing a reader's
          place.
        */}
        <div className="flex min-h-5 items-center">
          {isLoading && !isFirstLoad ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Updating the assessment list…
            </p>
          ) : null}
        </div>

        <div
          aria-busy={isLoading}
          className={
            isLoading && !isFirstLoad
              ? "opacity-60 transition-opacity motion-reduce:transition-none"
              : "transition-opacity motion-reduce:transition-none"
          }
        >
          <AssessmentList
            assessments={assessments}
            isLoading={isFirstLoad}
            hasFilter={hasFilter}
            panelId={PANEL_ID}
            labelledBy={`assessment-status-tab-${status}`}
            onCreateDraft={() => openDialog("form")}
            onEdit={(assessment) => openDialog("form", assessment)}
            onManageQuestions={(assessment) => openDialog("questions", assessment)}
            onPublish={(assessment) => openDialog("publish", assessment)}
            onUnpublish={(assessment) => openDialog("unpublish", assessment)}
            onArchive={(assessment) => openDialog("archive", assessment)}
            onRestore={(assessment) => openDialog("restore", assessment)}
            onDelete={(assessment) => openDialog("delete", assessment)}
            onClearFilter={() => {
              setSearch("");
              setStatus("all");
              setPage(1);
            }}
          />
        </div>

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

      <PermanentDeleteDialog
        open={dialog.kind === "delete"}
        onOpenChange={closeDialog}
        record={
          dialog.kind === "delete" && dialog.assessment
            ? { id: dialog.assessment.assessment_id }
            : null
        }
        noun="assessment"
        label={dialog.assessment?.title ?? ""}
        status={dialog.assessment?.status ?? ""}
        loadReferences={loadAssessmentReferences}
        onConfirm={confirmAssessmentDeletion}
        disposableNote="Its question list goes with it. The questions themselves stay in the Question Bank: they belong to it, not to this assessment."
        onDeleted={() => {
          const title = dialog.assessment?.title;
          setDialog(NO_DIALOG);
          confirm(`${title} was deleted permanently.`);
          reload();
        }}
      />

      <AssessmentRestoreDialog
        open={dialog.kind === "restore"}
        onOpenChange={closeDialog}
        assessment={dialog.kind === "restore" ? dialog.assessment : null}
        onRestored={(restored) => {
          setDialog(NO_DIALOG);
          confirm(
            `${restored?.title ?? dialog.assessment?.title} is a draft again. Publish it when it is ready.`,
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

      <AssessmentUnpublishDialog
        open={dialog.kind === "unpublish"}
        onOpenChange={closeDialog}
        assessment={dialog.kind === "unpublish" ? dialog.assessment : null}
        onUnpublished={(draft) => {
          const title = draft?.title ?? dialog.assessment?.title;
          setDialog(NO_DIALOG);
          confirm(`${title} is a draft again. Publish it when it is ready.`);
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
