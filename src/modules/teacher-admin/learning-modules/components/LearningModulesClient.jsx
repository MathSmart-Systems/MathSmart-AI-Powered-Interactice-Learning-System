"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Pencil, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { MODULE_DIALOG_MODES } from "../action-state";
import { rangeLabel } from "../utils/format.js";
import { restoreModuleAction } from "../services/actions";

import { ArchiveModuleDialog } from "./ArchiveModuleDialog";
import { ModuleDialog } from "./ModuleDialog";
import { ModuleRow } from "./ModuleRow";
import { LearningModulesEmpty } from "./LearningModulesStates";
import { Pagination } from "./Pagination";
import { SubmitButton } from "./SubmitButton";

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

  const publishedModules = items.filter((module) => module.status === "published");
  const draftModules = items.filter((module) => module.status === "draft");
  const archivedModules = items.filter((module) => module.status === "archived");

  const currentModules =
    tab === "archived" ? archivedModules : tab === "draft" ? draftModules : publishedModules;

  function openCreate() {
    setDialog({ key: "create", mode: MODULE_DIALOG_MODES.CREATE, module: null });
  }

  function openEdit(module) {
    setDialog({ key: `edit-${module.id}`, mode: MODULE_DIALOG_MODES.EDIT, module });
  }

  function openArchive(module) {
    setDialog({ key: `archive-${module.id}`, mode: "archive", module });
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
            Learning Modules
          </h1>
          <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        </div>

        <p className="max-w-2xl border-l-[3px] border-primary bg-card px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          A module is a step on the learning path: an objective, a short explanation, the core
          rules it teaches, and worked examples. Publishing puts it in front of learners, so a
          published module needs at least one complete rule and one worked example.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <form method="get" role="search" className="flex-1 sm:max-w-80">
            <div className="flex items-center gap-2">
              <Input
                name="search"
                type="search"
                defaultValue={search}
                placeholder="Search modules"
                aria-label="Search modules"
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
                <Link href="/teacher/learning-modules">Clear search</Link>
              </Button>
            ) : null}

            <Button className="h-9 px-4" onClick={openCreate}>
              <Plus aria-hidden="true" className="size-4" />
              New module
            </Button>
          </div>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Filter the Learning Modules"
        className="flex items-center gap-5 border-b border-border"
      >
        {TABS.map((item) => {
          const count =
            item.id === "published"
              ? publishedModules.length
              : item.id === "draft"
                ? draftModules.length
                : archivedModules.length;
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
          <LearningModulesEmpty hasSearch={Boolean(search)} onClearSearch={close} />
        ) : currentModules.length === 0 ? (
          <p className="border-l-[3px] border-border bg-card px-5 py-4 text-sm leading-relaxed text-muted-foreground">
            {tab === "archived"
              ? "No archived modules yet. Archive a module and it appears here, kept with its records and ready to restore."
              : tab === "draft"
                ? search
                  ? "No drafts match your search. Try clearing the search, or start writing a new module."
                  : "No drafts yet. Use “+ New module” to start writing one."
                : search
                  ? "No published modules match your search. Clearing the search shows your drafts too."
                  : "No published modules yet. Publish a draft and it appears here for learners."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {currentModules.map((module) =>
              tab === "archived" ? (
                <ModuleRow
                  key={module.id}
                  module={module}
                  actions={
                    <form action={restoreModuleAction}>
                      <input type="hidden" name="id" value={module.id} />
                      <SubmitButton
                        variant="ghost"
                        size="icon-sm"
                        label={
                          <>
                            <ArchiveRestore aria-hidden="true" className="size-4" />
                            <span className="sr-only">Restore module</span>
                          </>
                        }
                        pendingLabel="Restoring…"
                      />
                    </form>
                  }
                />
              ) : (
                <ModuleRow
                  key={module.id}
                  module={module}
                  actions={
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit module"
                        onClick={() => openEdit(module)}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Archive module"
                        onClick={() => openArchive(module)}
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