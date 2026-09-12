"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Plus, Search, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  DEFAULT_PAGE_SIZE,
  listActivities,
  listModules,
} from "../services/activity-admin-service.js";
import { ActivityArchiveDialog } from "./ActivityArchiveDialog.jsx";
import { ActivityFormModal } from "./ActivityFormModal.jsx";
import { ActivityList } from "./ActivityList.jsx";

const SEARCH_DEBOUNCE_MS = 300;
const CONFIRMATION_MS = 6000;

const SEARCH_INPUT_ID = "activity-search-input";
const STATUS_FILTER_ID = "activity-status-filter";
const MODULE_FILTER_ID = "activity-module-filter";

const NO_DIALOG = { kind: null, activity: null };

export function TeacherActivitiesView() {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedModuleId, setSelectedModuleId] = useState("all");
  const [page, setPage] = useState(1);
  const [reloadIndex, setReloadIndex] = useState(0);

  const [activities, setActivities] = useState([]);
  const [modules, setModules] = useState([]);
  const [meta, setMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [dialog, setDialog] = useState(NO_DIALOG);
  const [confirmation, setConfirmation] = useState(null);

  const confirmationTimer = useRef(null);

  const confirm = useCallback((message) => {
    setConfirmation(message);
    clearTimeout(confirmationTimer.current);
    confirmationTimer.current = setTimeout(() => setConfirmation(null), CONFIRMATION_MS);
  }, []);

  useEffect(() => () => clearTimeout(confirmationTimer.current), []);

  const reload = useCallback(() => setReloadIndex((index) => index + 1), []);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Load modules for lookup and dropdowns
  useEffect(() => {
    let active = true;

    async function load() {
      const result = await listModules({ pageSize: 100 });
      if (active && result.ok && Array.isArray(result.data)) {
        setModules(result.data);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  // Load activities from server
  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      const result = await listActivities({
        search: appliedSearch,
        status: status === "all" ? null : status,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
      });

      if (!active) {
        return;
      }

      if (result.ok) {
        setActivities(result.data || []);
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

  // Client-side module filtering (in addition to server search/status)
  const filteredActivities = useMemo(() => {
    if (selectedModuleId === "all") {
      return activities;
    }
    return activities.filter((act) => act.module_id === selectedModuleId);
  }, [activities, selectedModuleId]);

  const hasSearchOrFilter = Boolean(appliedSearch || status !== "all" || selectedModuleId !== "all");

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Practice Activities
          </h1>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
            Maintain interactive practice sets, duration targets, and passing thresholds for ARAL learning modules.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            type="button"
            className="h-10 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-xs"
            onClick={() => setDialog({ kind: "form", activity: null })}
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>Create Activity</span>
          </Button>
        </div>
      </div>

      {/* Confirmation notification */}
      {confirmation ? (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>{confirmation}</span>
          </div>
          <button
            type="button"
            onClick={() => setConfirmation(null)}
            className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Error alert banner */}
      {error ? (
        <div
          role="alert"
          className="flex items-start justify-between rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <div className="flex items-start gap-3">
            <TriangleAlert className="size-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">Could not load activities</p>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reload}
            className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            Try Again
          </Button>
        </div>
      ) : null}

      {/* Filter and Search Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border/80 bg-card p-3 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={SEARCH_INPUT_ID}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by activity title..."
            className="h-10 pl-9 border-border/70 bg-background/60 focus:bg-background"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-[150px]">
            <Label htmlFor={STATUS_FILTER_ID} className="sr-only">
              Filter by status
            </Label>
            <Select
              value={status}
              onValueChange={(val) => {
                setStatus(val);
                setPage(1);
              }}
            >
              <SelectTrigger id={STATUS_FILTER_ID} className="h-10 text-xs bg-background/60">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Drafts</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-[200px]">
            <Label htmlFor={MODULE_FILTER_ID} className="sr-only">
              Filter by module
            </Label>
            <Select
              value={selectedModuleId}
              onValueChange={(val) => {
                setSelectedModuleId(val);
              }}
            >
              <SelectTrigger id={MODULE_FILTER_ID} className="h-10 text-xs bg-background/60 truncate">
                <SelectValue placeholder="All Modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {modules.map((m) => (
                  <SelectItem key={m.module_id} value={m.module_id}>
                    {m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main List Grid */}
      <ActivityList
        activities={filteredActivities}
        modules={modules}
        isLoading={isLoading}
        hasSearchOrFilter={hasSearchOrFilter}
        onEdit={(activity) => setDialog({ kind: "form", activity })}
        onArchive={(activity) => setDialog({ kind: "archive", activity })}
        onCreate={() => setDialog({ kind: "form", activity: null })}
      />

      {/* Pagination Controls */}
      {meta && meta.totalPages > 1 ? (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border/80 pt-4 text-xs text-muted-foreground">
          <p>
            Showing <span className="font-semibold text-foreground">{(meta.page - 1) * meta.pageSize + 1}</span> to{" "}
            <span className="font-semibold text-foreground">
              {Math.min(meta.page * meta.pageSize, meta.totalItems)}
            </span>{" "}
            of <span className="font-semibold text-foreground">{meta.totalItems}</span> activities
          </p>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2.5"
              disabled={meta.page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Previous
            </Button>

            <span className="px-3 py-1 font-semibold text-foreground">
              Page {meta.page} of {meta.totalPages}
            </span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2.5"
              disabled={meta.page >= meta.totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            >
              Next
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Create / Edit Modal */}
      <ActivityFormModal
        open={dialog.kind === "form"}
        onOpenChange={(open) => {
          if (!open) setDialog(NO_DIALOG);
        }}
        activity={dialog.activity}
        modules={modules}
        onSaved={(saved) => {
          setDialog(NO_DIALOG);
          confirm(
            dialog.activity
              ? `Activity "${saved.title}" updated.`
              : `Activity "${saved.title}" created successfully.`
          );
          reload();
        }}
      />

      {/* Archive Confirmation Dialog */}
      <ActivityArchiveDialog
        open={dialog.kind === "archive"}
        onOpenChange={(open) => {
          if (!open) setDialog(NO_DIALOG);
        }}
        activity={dialog.activity}
        onArchived={(archived) => {
          setDialog(NO_DIALOG);
          confirm(`Activity "${archived.title}" has been archived.`);
          reload();
        }}
      />
    </div>
  );
}
