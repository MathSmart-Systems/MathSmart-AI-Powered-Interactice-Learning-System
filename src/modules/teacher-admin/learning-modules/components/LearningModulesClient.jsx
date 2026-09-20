"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, LoaderCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PermanentDeleteDialog, ResultAnnouncer, StatusTabs } from "@/modules/shared";

import { MODULE_DIALOG_MODES } from "../action-state";
import { STATUS_LABELS } from "../constants";
import { rangeLabel } from "../utils/format.js";
import { MODULE_RESULTS_ID, learningModulesUrl } from "../utils/urls.js";
import { deleteModuleAction, readModuleReferencesAction } from "../services/actions";

import { ArchiveModuleDialog } from "./ArchiveModuleDialog";
import { ModuleDialog } from "./ModuleDialog";
import { ModuleRow } from "./ModuleRow";
import { LearningModulesEmpty } from "./LearningModulesStates";
import { Pagination } from "./Pagination";
import { RestoreModuleForm } from "./RestoreModuleForm";

const TABS = [
  { id: "published", label: "Published" },
  { id: "draft", label: "Draft" },
  { id: "archived", label: "Archived" },
];

/**
 * The interactive shell the library list lives in. Every button, every dialog
 * and the search field happen here, so the server component that loads the
 * modules never touches a hook and the list rows stay purely presentational.
 */
export function LearningModulesClient({
  items,
  totalItems,
  page,
  totalPages,
  pageSize,
  search,
  status,
  competencies,
  statusCounts,
}) {
  const [dialog, setDialog] = useState(null);
  const router = useRouter();
  const [isSearching, startSearch] = useTransition();

  // Follows the address when the address changes on its own — Clear search,
  // the back button — and is adjusted during render rather than in an effect,
  // which would show the stale term for one frame.
  const [term, setTerm] = useState(search);
  const [lastSearch, setLastSearch] = useState(search);
  if (lastSearch !== search) {
    setLastSearch(search);
    setTerm(search);
  }

  const statusLabel = STATUS_LABELS[status] ?? "Draft";
  const caption = rangeLabel({ page, pageSize, totalItems, statusLabel });

  function openCreate() {
    setDialog({ key: "create", mode: MODULE_DIALOG_MODES.CREATE, module: null });
  }

  function openEdit(module) {
    setDialog({ key: `edit-${module.id}`, mode: MODULE_DIALOG_MODES.EDIT, module });
  }

  function openArchive(module) {
    setDialog({ key: `archive-${module.id}`, mode: "archive", module });
  }

  function openDelete(module) {
    setDialog({ key: `delete-${module.id}`, mode: "delete", module });
  }

  function close() {
    setDialog(null);
  }

  const deletingId = dialog?.mode === "delete" ? dialog.module.id : null;

  const loadModuleReferences = useCallback(
    () => readModuleReferencesAction(deletingId),
    [deletingId],
  );

  const confirmModuleDeletion = useCallback(
    () => deleteModuleAction(deletingId),
    [deletingId],
  );

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Teacher / administrator workspace</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Learning Modules
          </h1>
          <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        </div>

        {/*
          What the screen is for, in a sentence. The publishing conditions used
          to live here, four lines above the form and nowhere near the control
          they govern; they are stated on the status field and in the refusal
          instead, where a teacher meets them.
        */}
        <p className="max-w-2xl border-l-[3px] border-primary bg-card px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          Create focused lessons with an objective, key rules, and worked examples. Publish when
          the module and its competency are ready for learners.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          {/*
            A client navigation, not a native GET submit. A GET form replaces
            the document: the list a teacher was reading is thrown away, the
            page returns to the top, and there is nowhere to show that anything
            is happening. This keeps the rows, the scroll position and the
            publication state, and puts the spinner on the button pressed.
          */}
          <form
            role="search"
            className="flex-1 sm:max-w-80"
            onSubmit={(event) => {
              event.preventDefault();
              startSearch(() => {
                router.push(learningModulesUrl({ search: term, status, page: 1 }), {
                  scroll: false,
                });
              });
            }}
          >
            <div className="flex items-center gap-2">
              <Input
                name="search"
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search modules"
                aria-label="Search modules"
              />
              <Button type="submit" size="sm" variant="outline" disabled={isSearching}>
                {isSearching ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <Search aria-hidden="true" className="size-4" />
                )}
                {isSearching ? "Searching…" : "Search"}
              </Button>
            </div>
          </form>

          <div className="flex items-center gap-3">
            {search ? (
              <Button asChild variant="outline" className="h-9 px-4">
                <Link href={learningModulesUrl({ status })} scroll={false}>
                  Clear search
                </Link>
              </Button>
            ) : null}

            <Button className="h-9 px-4" onClick={openCreate}>
              <Plus aria-hidden="true" className="size-4" />
              New module
            </Button>
          </div>
        </div>
      </header>

      <StatusTabs
        label="Filter modules by publication state"
        tabs={TABS}
        current={status}
        counts={statusCounts}
        hrefFor={(id) => learningModulesUrl({ search, status: id })}
      />

      <div
        id={MODULE_RESULTS_ID}
        aria-busy={isSearching}
        className={
          isSearching
            ? "flex scroll-mt-4 flex-col gap-4 opacity-60 transition-opacity motion-reduce:transition-none"
            : "flex scroll-mt-4 flex-col gap-4 transition-opacity motion-reduce:transition-none"
        }
      >
        {items.length === 0 ? (
          <LearningModulesEmpty hasSearch={Boolean(search)} status={status} />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((module) =>
              status === "archived" ? (
                <ModuleRow
                  key={module.id}
                  module={module}
                  actions={
                    <>
                      {/* Editing an archived module is the only way to give it
                          a free place before it is restored. Without it a
                          module whose slot had been taken could be refused
                          forever with nothing the teacher could do about it. */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => openEdit(module)}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                        Edit<span className="sr-only">{module.title}</span>
                      </Button>
                      <RestoreModuleForm module={module} />
                      {/*
                        Only on an archived row, because only an archived
                        module is in scope for removal at all. Archive stays
                        the separate, safer action; this one is reached through
                        it.
                      */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => openDelete(module)}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                        Delete permanently<span className="sr-only">{module.title}</span>
                      </Button>
                    </>
                  }
                />
              ) : (
                <ModuleRow
                  key={module.id}
                  module={module}
                  actions={
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => openEdit(module)}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                        Edit<span className="sr-only">{module.title}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => openArchive(module)}
                      >
                        <Archive aria-hidden="true" className="size-4" />
                        Archive<span className="sr-only">{module.title}</span>
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

        <Pagination search={search} status={status} page={page} totalPages={totalPages} />
      </footer>

      <PermanentDeleteDialog
        open={dialog?.mode === "delete"}
        onOpenChange={close}
        record={dialog?.mode === "delete" ? { id: dialog.module.id } : null}
        noun="learning module"
        label={dialog?.module?.title ?? ""}
        status={dialog?.module?.statusLabel ?? ""}
        loadReferences={loadModuleReferences}
        onConfirm={confirmModuleDeletion}
        onDeleted={close}
      />

      {dialog?.mode === "archive" ? (
        <ArchiveModuleDialog
          key={dialog.key}
          module={dialog.module}
          onOpenChange={close}
        />
      ) : null}

      {dialog?.mode === MODULE_DIALOG_MODES.CREATE ? (
        <ModuleDialog
          key={dialog.key}
          mode={dialog.mode}
          module={null}
          competencies={competencies}
          onOpenChange={close}
        />
      ) : null}

      {dialog?.mode === MODULE_DIALOG_MODES.EDIT ? (
        <ModuleDialog
          key={dialog.key}
          mode={dialog.mode}
          module={dialog.module}
          competencies={competencies}
          onOpenChange={close}
        />
      ) : null}
    </div>
  );
}
