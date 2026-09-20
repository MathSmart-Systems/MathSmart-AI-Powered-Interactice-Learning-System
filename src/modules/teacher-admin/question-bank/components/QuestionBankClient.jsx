"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Archive, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PermanentDeleteDialog, ResultAnnouncer, StatusTabs } from "@/modules/shared";

import { QuestionDialog } from "./QuestionDialog";
import { ArchiveQuestionDialog } from "./ArchiveQuestionDialog";
import { QuestionFilters } from "./QuestionFilters";
import { Pagination } from "./Pagination";
import { QuestionBankEmpty } from "./QuestionBankStates";
import { QuestionRow } from "./QuestionRow";
import { RestoreQuestionForm } from "./RestoreQuestionForm";
import { STATUS_LABELS } from "../constants";
import { rangeLabel } from "../utils/format.js";
import { questionBankUrl } from "../utils/urls.js";
import {
  deleteQuestionAction,
  readQuestionReferencesAction,
} from "../services/actions";

const TABS = [
  { id: "published", label: "Published" },
  { id: "draft", label: "Draft" },
  { id: "archived", label: "Archived" },
];

/**
 * The interactive shell the list lives in. Every button, every dialog and the
 * search field happen here, so the server component that loads the bank never
 * touches a hook and the list rows stay purely presentational.
 *
 * Nothing in here narrows the list. The publication state and the three
 * filters all live in the address and are applied by the API, so the count on
 * the active tab and the caption under the list both describe the same set the
 * rows came from.
 */
export function QuestionBankClient({
  items,
  totalItems,
  page,
  totalPages,
  pageSize,
  search,
  status,
  competencyId,
  questionType,
  difficulty,
  competencies,
  competenciesAvailable,
}) {
  const [dialog, setDialog] = useState(null);

  const filters = { search, status, competencyId, questionType, difficulty };
  const hasFilter = Boolean(search || competencyId || questionType || difficulty);
  const statusLabel = STATUS_LABELS[status] ?? "Draft";
  const caption = rangeLabel({ page, pageSize, totalItems, statusLabel });

  /** Opens an empty authoring dialog for a new question. */
  function openCreate() {
    setDialog({ key: "create", mode: "create", question: null });
  }

  /** Opens the authoring dialog for the selected question. */
  function openEdit(question) {
    setDialog({ key: `edit-${question.id}`, mode: "edit", question });
  }

  /** Opens the archive confirmation for the selected question. */
  function openArchive(question) {
    setDialog({ key: `archive-${question.id}`, mode: "archive", question });
  }

  /** Opens the permanent-delete confirmation for the selected question. */
  function openDelete(question) {
    setDialog({ key: `delete-${question.id}`, mode: "delete", question });
  }

  /** Closes whichever Question Bank dialog is active. */
  function close() {
    setDialog(null);
  }

  const deletingId = dialog?.mode === "delete" ? dialog.question.id : null;

  const loadQuestionReferences = useCallback(
    () => readQuestionReferencesAction(deletingId),
    [deletingId],
  );

  const confirmQuestionDeletion = useCallback(
    () => deleteQuestionAction(deletingId),
    [deletingId],
  );

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Teacher / administrator workspace</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Question Bank
          </h1>
          <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        </div>

        <p className="max-w-2xl border-l-[3px] border-primary bg-card px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          Answer keys, explanations and hints are never shown back after they are saved. Re-enter
          them every time you edit a question.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <form method="get" role="search" className="flex-1 sm:max-w-80">
            {/* The filters the address already carries, so searching narrows
                the current view instead of resetting it. */}
            <input type="hidden" name="status" value={status} />
            {competencyId ? (
              <input type="hidden" name="competency_id" value={competencyId} />
            ) : null}
            {questionType ? <input type="hidden" name="type" value={questionType} /> : null}
            {difficulty ? <input type="hidden" name="difficulty" value={difficulty} /> : null}

            <div className="flex items-center gap-2">
              <Input
                name="search"
                type="search"
                defaultValue={search}
                placeholder="Search questions"
                aria-label="Search questions"
              />
              <Button type="submit" size="sm" variant="outline">
                <Search aria-hidden="true" className="size-4" />
                Search
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-3">
            {hasFilter ? (
              <Button asChild variant="outline" className="h-9 px-4">
                <Link href={questionBankUrl({ status })}>Clear filters</Link>
              </Button>
            ) : null}

            <Button className="h-9 px-4" onClick={openCreate}>
              <Plus aria-hidden="true" className="size-4" />
              New question
            </Button>
          </div>
        </div>

        <QuestionFilters
          filters={filters}
          competencies={competencies}
          competenciesAvailable={competenciesAvailable}
        />
      </header>

      <StatusTabs
        label="Filter questions by publication state"
        tabs={TABS}
        current={status}
        count={totalItems}
        hrefFor={(id) => questionBankUrl({ ...filters, status: id })}
      />

      <div className="flex flex-col gap-4">
        {items.length === 0 ? (
          <QuestionBankEmpty status={status} hasFilter={hasFilter} />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((question) =>
              question.status === "archived" ? (
                <QuestionRow
                  key={question.id}
                  question={question}
                  actions={
                    <>
                      {/* Every row action names the row it is about. A list of
                          buttons that all read "Archive question" gives a
                          screen-reader user no way to tell one from another. */}
                      <RestoreQuestionForm question={question} />
                      {/*
                        Only on an archived row, because only an archived
                        question is in scope for removal at all. Archive stays
                        the separate, safer action; this one is reached through
                        it.
                      */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => openDelete(question)}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                        Delete permanently<span className="sr-only">{question.prompt}</span>
                      </Button>
                    </>
                  }
                />
              ) : (
                <QuestionRow
                  key={question.id}
                  question={question}
                  actions={
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => openEdit(question)}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                        Edit<span className="sr-only">{question.prompt}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => openArchive(question)}
                      >
                        <Archive aria-hidden="true" className="size-4" />
                        Archive<span className="sr-only">{question.prompt}</span>
                      </Button>
                    </>
                  }
                />
              ),
            )}
          </ul>
        )}
      </div>

      <footer className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{caption}</p>
        <ResultAnnouncer message={caption} />

        <Pagination filters={filters} page={page} totalPages={totalPages} />
      </footer>

      <PermanentDeleteDialog
        open={dialog?.mode === "delete"}
        onOpenChange={close}
        record={dialog?.mode === "delete" ? { id: dialog.question.id } : null}
        noun="question"
        label={dialog?.question?.prompt ?? ""}
        status={dialog?.question?.statusLabel ?? ""}
        loadReferences={loadQuestionReferences}
        onConfirm={confirmQuestionDeletion}
        onDeleted={close}
      />

      {dialog?.mode === "archive" ? (
        <ArchiveQuestionDialog
          key={dialog.key}
          question={dialog.question}
          onOpenChange={close}
        />
      ) : null}

      {dialog?.mode === "create" ? (
        <QuestionDialog
          key={dialog.key}
          mode="create"
          competencies={competencies}
          onOpenChange={close}
        />
      ) : null}

      {dialog?.mode === "edit" ? (
        <QuestionDialog
          key={dialog.key}
          mode="edit"
          question={dialog.question}
          competencies={competencies}
          onOpenChange={close}
        />
      ) : null}
    </div>
  );
}
