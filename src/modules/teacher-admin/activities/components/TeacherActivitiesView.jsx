"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PermanentDeleteDialog, ResultAnnouncer } from "@/modules/shared";
import { NATIVE_SELECT_CLASS } from "@/modules/shared/utils/native-select.js";

import {
  DEFAULT_PAGE_SIZE,
  deleteActivityPermanently,
  listActivities,
  listModules,
  readActivityReferences,
} from "../services/activity-admin-service.js";
import { ActivityArchiveDialog } from "./ActivityArchiveDialog.jsx";
import { ActivityFormModal } from "./ActivityFormModal.jsx";
import { ActivityList } from "./ActivityList.jsx";
import { ActivityPublishDialog } from "./ActivityPublishDialog.jsx";
import { ActivityQuestionManagerModal } from "./ActivityQuestionManagerModal.jsx";
import { ActivityRestoreDialog } from "./ActivityRestoreDialog.jsx";

const SEARCH_DEBOUNCE_MS = 300;
const CONFIRMATION_MS = 6000;

const SEARCH_INPUT_ID = "activity-search-input";
const STATUS_FILTER_ID = "activity-status-filter";
const MODULE_FILTER_ID = "activity-module-filter";

/** Which dialog is open, and the activity row it was opened for. */
const NO_DIALOG = { kind: null, activity: null };

/**
 * Main Teacher Activities administration workspace component.
 *
 * Provides a responsive workspace for browsing, filtering, creating, editing,
 * publishing, archiving and restoring learner practice activities, and for
 * choosing the questions each one holds.
 *
 * @returns {JSX.Element}
 */
export function TeacherActivitiesView() {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedModuleId, setSelectedModuleId] = useState("all");
  const [page, setPage] = useState(1);
  const [reloadIndex, setReloadIndex] = useState(0);

  const [activities, setActivities] = useState([]);
  const [modules, setModules] = useState([]);
  const [moduleError, setModuleError] = useState(null);
  const [isLoadingModules, setIsLoadingModules] = useState(true);
  const [moduleReloadIndex, setModuleReloadIndex] = useState(0);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [dialog, setDialog] = useState(NO_DIALOG);
  const [confirmation, setConfirmation] = useState(null);

  /**
   * The last publication the API refused, and the reason it gave.
   *
   * One row at a time, because a teacher publishes one activity at a time.
   * Unlike a confirmation it is not put on a timer: a confirmation reports
   * something that already happened, while this is work still outstanding, and
   * taking it away after six seconds would take the reason with it.
   */
  const [publishRefusal, setPublishRefusal] = useState(null);

  const confirmationTimer = useRef(null);

  const confirm = useCallback((message) => {
    setConfirmation(message);
    clearTimeout(confirmationTimer.current);
    confirmationTimer.current = setTimeout(() => setConfirmation(null), CONFIRMATION_MS);
  }, []);

  useEffect(() => () => clearTimeout(confirmationTimer.current), []);

  const reload = useCallback(() => setReloadIndex((index) => index + 1), []);
  const retryModules = useCallback(() => setModuleReloadIndex((index) => index + 1), []);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Load modules for lookup and dropdowns across all available pages
  useEffect(() => {
    let active = true;

    /**
     * Fetches all learning modules for dropdown options and lookup.
     *
     * A failure on any page leaves what was already loaded alone rather than
     * replacing the dropdowns with a shorter list: a partial module list looks
     * exactly like a complete one, and picking from it would file an activity
     * under the wrong module.
     */
    async function load() {
      setIsLoadingModules(true);
      setModuleError(null);
      let collected = [];
      let currentPage = 1;
      let totalPages = 1;

      do {
        const result = await listModules({ page: currentPage, pageSize: 100 });
        if (!active) {
          return;
        }
        if (!result.ok || !Array.isArray(result.data)) {
          setModuleError(result.error || "Learning modules could not be loaded.");
          setIsLoadingModules(false);
          return;
        }
        collected = collected.concat(result.data);
        totalPages = Math.min(result.meta?.totalPages || 1, 50);
        currentPage += 1;
      } while (currentPage <= totalPages);

      if (active) {
        setModules(collected);
        setModuleError(null);
        setIsLoadingModules(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [moduleReloadIndex]);

  // Load activities from server with search, status, and module filters
  useEffect(() => {
    let active = true;

    /**
     * Fetches paginated activity records matching current filters.
     */
    async function load() {
      setIsLoading(true);
      const result = await listActivities({
        search: appliedSearch,
        status: status === "all" ? null : status,
        moduleId: selectedModuleId === "all" ? null : selectedModuleId,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
      });

      if (!active) {
        return;
      }

      if (result.ok) {
        // A page beyond the end comes back empty. Archiving the last row on
        // page 3 used to leave the list showing "no matching activities" under
        // filters that matched plenty.
        const lastPage = Math.max(1, result.meta?.totalPages || 1);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setActivities(result.data || []);
        setMeta(result.meta);
        setError(null);
      } else {
        // The rows that were on screen are no longer known to exist, and
        // leaving them under an error banner invited acting on them.
        setActivities([]);
        setMeta(null);
        setError(result.error);
      }
      setIsLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [appliedSearch, status, selectedModuleId, page, reloadIndex]);

  const moduleTitles = useMemo(() => {
    const titles = new Map();
    for (const item of modules) {
      titles.set(item.module_id, item.title);
    }
    return titles;
  }, [modules]);

  const hasSearchOrFilter = Boolean(
    appliedSearch || status !== "all" || selectedModuleId !== "all",
  );

  /**
   * Whether there is nothing on screen yet, as opposed to a list being
   * refreshed.
   *
   * Publishing, archiving or restoring an activity re-reads the collection,
   * and the skeleton used to take the cards away while it did. A page of
   * placeholder cards is shorter than a page of real ones, so the browser
   * clamped a scroll offset it could no longer honour and the cards came back
   * with the reader at the top. The skeleton is for arriving with nothing.
   */
  const isFirstLoad = isLoading && meta === null;

  /** The sentence under the list, and the one that gets announced. */
  const caption = (() => {
    if (isFirstLoad) {
      return "Loading activities…";
    }
    if (error) {
      return "Activities could not be loaded.";
    }
    const total = meta?.totalItems ?? activities.length;
    if (!total) {
      return hasSearchOrFilter
        ? "No activities match these filters"
        : "No activities yet";
    }
    const first = ((meta?.page ?? 1) - 1) * (meta?.pageSize ?? DEFAULT_PAGE_SIZE) + 1;
    const last = Math.min(first + activities.length - 1, total);
    return `Showing ${first}–${last} of ${total} ${total === 1 ? "activity" : "activities"}`;
  })();

  /** Keeps a dialog's copy of a row in step with the list it came from. */
  const openDialog = useCallback(
    (kind, activity) => setDialog({ kind, activity }),
    [],
  );

  const deletingId = dialog.kind === "delete" ? dialog.activity?.activity_id : null;

  const loadActivityReferences = useCallback(
    () => readActivityReferences(deletingId),
    [deletingId],
  );

  const confirmActivityDeletion = useCallback(
    () => deleteActivityPermanently(deletingId),
    [deletingId],
  );

  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Practice Activities
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Maintain interactive practice sets, their questions, duration targets, and passing
            thresholds for ARAL learning modules.
          </p>
        </div>

        <div className="shrink-0">
          <Button
            type="button"
            className="h-11 gap-2 px-5"
            onClick={() => openDialog("form", null)}
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>Create activity</span>
          </Button>
        </div>
      </div>

      {/* Confirmation notification */}
      {confirmation ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 border-l-[3px] border-primary bg-card px-4 py-3 text-sm text-foreground"
        >
          <div className="flex min-w-0 items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 break-words">{confirmation}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setConfirmation(null)}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {/* Error alert banner */}
      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-3 border-l-[3px] border-destructive bg-destructive/5 p-4 text-sm sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            <TriangleAlert
              className="mt-0.5 size-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-destructive">Could not load activities</p>
              <p className="break-words text-muted-foreground">{error}</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={reload}>
            Try again
          </Button>
        </div>
      ) : null}

      {/* Module loading error */}
      {moduleError ? (
        <div
          role="alert"
          className="flex flex-col gap-3 border-l-[3px] border-destructive bg-card p-4 text-sm sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            <TriangleAlert
              className="mt-0.5 size-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-foreground">Could not load learning modules</p>
              <p className="break-words text-muted-foreground">
                {moduleError} An activity cannot be created or filed without one, so those
                actions stay unavailable until this succeeds.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={retryModules}
          >
            Retry modules
          </Button>
        </div>
      ) : null}

      {/* Filter and Search Toolbar */}
      <div className="flex flex-col gap-3 border border-border bg-card p-3 lg:flex-row lg:items-end">
        <div className="relative min-w-0 flex-1">
          <Label htmlFor={SEARCH_INPUT_ID} className="mb-2 block">
            Search activities
          </Label>
          <Search
            className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={SEARCH_INPUT_ID}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by activity title"
            className="pl-9"
          />
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:w-[28rem]">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor={STATUS_FILTER_ID}>Status</Label>
            <select
              id={STATUS_FILTER_ID}
              className={NATIVE_SELECT_CLASS}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="draft">Drafts</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor={MODULE_FILTER_ID}>Learning module</Label>
            <select
              id={MODULE_FILTER_ID}
              className={NATIVE_SELECT_CLASS}
              value={selectedModuleId}
              disabled={Boolean(moduleError)}
              onChange={(event) => {
                setSelectedModuleId(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All modules</option>
              {modules.map((item) => (
                <option key={item.module_id} value={item.module_id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

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
            Updating the activity list…
          </p>
        ) : null}
      </div>

      {/* Main List Grid */}
      <div
        aria-busy={isLoading}
        className={
          isLoading && !isFirstLoad
            ? "opacity-60 transition-opacity motion-reduce:transition-none"
            : "transition-opacity motion-reduce:transition-none"
        }
      >
        <ActivityList
          activities={activities}
          moduleTitles={moduleTitles}
          isLoading={isFirstLoad}
          hasError={Boolean(error)}
          hasSearchOrFilter={hasSearchOrFilter}
          publishRefusal={publishRefusal}
          onEdit={(activity) => openDialog("form", activity)}
          onQuestions={(activity) => openDialog("questions", activity)}
          onPublish={(activity) => openDialog("publish", activity)}
          onArchive={(activity) => openDialog("archive", activity)}
          onRestore={(activity) => openDialog("restore", activity)}
          onDelete={(activity) => openDialog("delete", activity)}
          onCreate={() => openDialog("form", null)}
        />
      </div>

      {/* Result count and pagination */}
      <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{caption}</p>
        <ResultAnnouncer message={isFirstLoad ? "" : caption} />

        {totalPages > 1 ? (
          <nav
            aria-label="Activity pages"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={(meta?.page ?? 1) <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Previous
            </Button>

            <span className="px-3 text-sm font-medium text-foreground">
              Page {meta?.page ?? 1} of {totalPages}
            </span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={(meta?.page ?? 1) >= totalPages || isLoading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </nav>
        ) : null}
      </div>

      {/* Create / Edit Modal */}
      <ActivityFormModal
        open={dialog.kind === "form"}
        onOpenChange={(open) => {
          if (!open) setDialog(NO_DIALOG);
        }}
        activity={dialog.kind === "form" ? dialog.activity : null}
        modules={modules}
        modulesUnavailable={Boolean(moduleError) || isLoadingModules}
        onSaved={(saved) => {
          setDialog(NO_DIALOG);
          confirm(
            dialog.activity
              ? `“${saved?.title ?? dialog.activity.title}” was updated.`
              : `“${saved?.title ?? "The activity"}” was created as a draft.`,
          );
          reload();
        }}
      />

      {/* Questions */}
      <ActivityQuestionManagerModal
        open={dialog.kind === "questions"}
        onOpenChange={(open) => {
          if (!open) setDialog(NO_DIALOG);
        }}
        activity={dialog.kind === "questions" ? dialog.activity : null}
        onSaved={(saved) => {
          const count = saved?.question_count;
          const editedId = dialog.activity?.activity_id;
          setDialog(NO_DIALOG);
          // The teacher has just worked on the card the refusal was about, so
          // the refusal is stale whatever they changed. What the activity is
          // still missing, if anything, comes back with the reload.
          setPublishRefusal((refusal) =>
            refusal?.activityId === editedId ? null : refusal,
          );
          confirm(
            typeof count === "number"
              ? `“${saved?.title ?? dialog.activity?.title}” now holds ${count} ${
                  count === 1 ? "question" : "questions"
                }.`
              : "The question list was saved.",
          );
          reload();
        }}
      />

      {/* Publish */}
      <ActivityPublishDialog
        open={dialog.kind === "publish"}
        onOpenChange={(open) => {
          if (!open) setDialog(NO_DIALOG);
        }}
        activity={dialog.kind === "publish" ? dialog.activity : null}
        moduleTitle={
          dialog.activity ? (moduleTitles.get(dialog.activity.module_id) ?? null) : null
        }
        onRefused={(message) =>
          setPublishRefusal((refusal) => {
            const publishedId = dialog.activity?.activity_id;
            if (message) {
              return { activityId: publishedId, message };
            }
            // A publication that succeeded clears only its own card's refusal.
            // Clearing whatever was there would let publishing a second
            // activity quietly retire the warning still standing against the
            // first.
            return refusal?.activityId === publishedId ? null : refusal;
          })
        }
        onPublished={(published) => {
          setDialog(NO_DIALOG);
          confirm(
            `“${published?.title ?? dialog.activity?.title}” is published and available to learners.`,
          );
          reload();
        }}
      />

      {/* Archive */}
      <ActivityArchiveDialog
        open={dialog.kind === "archive"}
        onOpenChange={(open) => {
          if (!open) setDialog(NO_DIALOG);
        }}
        activity={dialog.kind === "archive" ? dialog.activity : null}
        onArchived={(archived) => {
          setDialog(NO_DIALOG);
          confirm(`“${archived.title}” was archived. Learners no longer see it.`);
          reload();
        }}
      />

      {/* Delete permanently */}
      <PermanentDeleteDialog
        open={dialog.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(NO_DIALOG);
        }}
        record={
          dialog.kind === "delete" && dialog.activity
            ? { id: dialog.activity.activity_id }
            : null
        }
        noun="activity"
        label={dialog.activity?.title ?? ""}
        status={dialog.activity?.status ?? ""}
        loadReferences={loadActivityReferences}
        onConfirm={confirmActivityDeletion}
        disposableNote="Its question list goes with it. The questions themselves stay in the Question Bank: they belong to it, not to this activity."
        onDeleted={() => {
          const title = dialog.activity?.title;
          setDialog(NO_DIALOG);
          confirm(`“${title}” was deleted permanently.`);
          reload();
        }}
      />

      {/* Restore */}
      <ActivityRestoreDialog
        open={dialog.kind === "restore"}
        onOpenChange={(open) => {
          if (!open) setDialog(NO_DIALOG);
        }}
        activity={dialog.kind === "restore" ? dialog.activity : null}
        onRestored={(restored) => {
          setDialog(NO_DIALOG);
          confirm(`“${restored.title}” is a draft again. Publish it when it is ready.`);
          reload();
        }}
      />
    </div>
  );
}
