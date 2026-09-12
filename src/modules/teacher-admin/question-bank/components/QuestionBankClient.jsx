"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Pencil, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { QuestionDialog } from "./QuestionDialog";
import { ArchiveQuestionDialog } from "./ArchiveQuestionDialog";
import { Pagination } from "./Pagination";
import { QuestionBankEmpty } from "./QuestionBankStates";
import { QuestionRow } from "./QuestionRow";
import { SubmitButton } from "./SubmitButton";
import { rangeLabel } from "../utils/format.js";
import { restoreQuestionAction } from "../services/actions";

/**
 * The interactive shell the list lives in. Every button, every dialog and the
 * search field happen here, so the server component that loads the bank never
 * touches a hook and the list rows stay purely presentational.
 */
export function QuestionBankClient({
  items,
  totalItems,
  page,
  totalPages,
  pageSize,
  search,
  competencies,
}) {
  const [dialog, setDialog] = useState(null);
  const [tab, setTab] = useState("published");
  const tabsId = useId();

  const TABS = [
    { id: "published", label: "Published" },
    { id: "draft", label: "Draft" },
    { id: "archived", label: "Archived" },
  ];

  const publishedQuestions = items.filter((question) => question.status === "published");
  const draftQuestions = items.filter((question) => question.status === "draft");
  const archivedQuestions = items.filter((question) => question.status === "archived");

  const currentQuestions =
    tab === "archived" ? archivedQuestions : tab === "draft" ? draftQuestions : publishedQuestions;

  function openCreate() {
    setDialog({ key: "create", mode: "create", question: null });
  }

  function openEdit(question) {
    setDialog({ key: `edit-${question.id}`, mode: "edit", question });
  }

  function openArchive(question) {
    setDialog({ key: `archive-${question.id}`, mode: "archive", question });
  }

  function close() {
    setDialog(null);
  }

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
                <span className="sr-only">Search</span>
              </Button>
            </div>
          </form>

          <div className="flex items-center gap-3">
            {search ? (
              <Button asChild variant="outline" className="h-9 px-4">
                <Link href="/teacher/question-bank">Clear search</Link>
              </Button>
            ) : null}

            <Button className="h-9 px-4" onClick={openCreate}>
              <Plus aria-hidden="true" className="size-4" />
              New question
            </Button>
          </div>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Filter the Question Bank"
        className="flex items-center gap-5 border-b border-border"
      >
        {TABS.map((item) => {
          const count =
            item.id === "published"
              ? publishedQuestions.length
              : item.id === "draft"
                ? draftQuestions.length
                : archivedQuestions.length;
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${tabsId}-${item.id}-tab`}
              aria-selected={selected}
              aria-controls={`${tabsId}-${item.id}-panel`}
              onClick={() => setTab(item.id)}
              className={
                selected
                  ? "-mb-px inline-flex items-center gap-1.5 rounded-t-sm border-b-2 border-primary px-1 pb-2.5 text-sm font-semibold text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  : "-mb-px inline-flex items-center gap-1.5 rounded-t-sm border-b-2 border-transparent px-1 pb-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              }
            >
              {item.label}
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${tabsId}-${tab}-panel`}
        aria-labelledby={`${tabsId}-${tab}-tab`}
        tabIndex={0}
        className="flex flex-col gap-4 outline-none"
      >
        {items.length === 0 ? (
          <QuestionBankEmpty hasSearch={Boolean(search)} onClearSearch={close} />
        ) : currentQuestions.length === 0 ? (
          <p className="border-l-[3px] border-border bg-card px-5 py-4 text-sm leading-relaxed text-muted-foreground">
            {tab === "archived"
              ? "No archived questions yet. Archive a question and it appears here, kept with its history and ready to restore."
              : tab === "draft"
                ? search
                  ? "No drafts match your search. Try clearing the search, or write a new draft."
                  : "No drafts yet. Use “+ New question” to start writing one."
                : search
                  ? "No published questions match your search. Clearing the search shows your drafts too."
                  : "No published questions yet. Publish a draft and it appears here for learners."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {currentQuestions.map((question) =>
              tab === "archived" ? (
                <QuestionRow
                  key={question.id}
                  question={question}
                  actions={
                    <form action={restoreQuestionAction}>
                      <input type="hidden" name="id" value={question.id} />
                      <SubmitButton
                        variant="ghost"
                        size="icon-sm"
                        label={
                          <>
                            <ArchiveRestore aria-hidden="true" className="size-4" />
                            <span className="sr-only">Restore question</span>
                          </>
                        }
                        pendingLabel="Restoring…"
                      />
                    </form>
                  }
                />
              ) : (
                <QuestionRow
                  key={question.id}
                  question={question}
                  actions={
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit question"
                        onClick={() => openEdit(question)}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Archive question"
                        onClick={() => openArchive(question)}
                      >
                        <Archive aria-hidden="true" className="size-4" />
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
        {items.length > 0 ? (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {rangeLabel({ page, pageSize, totalItems })}
          </p>
        ) : null}

        <Pagination search={search} page={page} totalPages={totalPages} />
      </footer>

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