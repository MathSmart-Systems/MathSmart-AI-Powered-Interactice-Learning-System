"use client";

import { useEffect, useRef, useState } from "react";
import { GraduationCap, Pencil, Plus, Power, PowerOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import {
  createGrade,
  createSection,
  deleteGrade,
  deleteSection,
  listGrades,
  listSections,
  updateGrade,
  updateSection,
} from "../services/api";
import { GradeFormDialog } from "./GradeFormDialog";
import { SectionFormDialog } from "./SectionFormDialog";

/** How long a completed-action message stays before it clears itself. */
const NOTICE_TIMEOUT_MS = 6000;

function StatusPill({ active }) {
  return (
    <span className="shrink-0 rounded-full border border-border bg-background/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function EmptyState({ message }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-background/50 px-4 py-6 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

/**
 * A single bordered row: the name and its status on the left, the two actions
 * on the right. Both actions carry their own word, because a teacher taking a
 * live section out of the directory should not have to interpret an icon.
 *
 * The row stacks below the `sm` breakpoint so the full action wording survives
 * a phone, and the buttons share that width evenly instead of being clipped.
 */
function DirectoryRow({ label, meta, active, onEdit, onToggle, working }) {
  const toggleText = working
    ? active
      ? "Deactivating…"
      : "Activating…"
    : active
      ? "Deactivate"
      : "Activate";
  const ToggleIcon = active ? PowerOff : Power;

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{label}</p>
          {meta ? <p className="truncate text-[11px] text-muted-foreground">{meta}</p> : null}
        </div>
        <StatusPill active={active} />
      </div>

      <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 sm:flex-none"
          onClick={onEdit}
          aria-label={`Edit ${label}`}
        >
          <Pencil aria-hidden="true" className="size-3.5" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 sm:flex-none"
          onClick={onToggle}
          disabled={working}
          aria-busy={working || undefined}
          aria-label={`${toggleText} ${label}`}
        >
          <ToggleIcon aria-hidden="true" className="size-3.5" />
          {toggleText}
        </Button>
      </div>
    </li>
  );
}

/**
 * The Grades & Sections workspace.
 *
 * The initial lists arrive from the server component (so the page is useful on
 * first paint) and every mutation refreshes them through the API. A refresh
 * keeps the rows it already has on screen — a directory that blanks itself
 * after every save is harder to follow than one that dims for a moment.
 */
export function GradesSectionsView({ initialGrades, initialSections, advisers, initialError }) {
  const [grades, setGrades] = useState(initialGrades);
  const [sections, setSections] = useState(initialSections);
  const [pageError, setPageError] = useState(null);

  const [gradeDialog, setGradeDialog] = useState({ open: false, record: null });
  const [sectionDialog, setSectionDialog] = useState({ open: false, record: null });

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [workingGradeId, setWorkingGradeId] = useState(null);
  const [workingSectionId, setWorkingSectionId] = useState(null);
  const [refreshingGrades, setRefreshingGrades] = useState(false);
  const [refreshingSections, setRefreshingSections] = useState(false);

  // One live region for the whole page: a busy line while a list is being
  // re-read, then the outcome. Two regions would talk over each other.
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  /** Shows a message that clears itself, so it never becomes stale furniture. */
  function announce(message) {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS);
  }

  /** Shows a message that stays until the work it describes is finished. */
  function announceBusy(message) {
    clearTimeout(noticeTimer.current);
    setNotice(message);
  }

  async function refreshGrades() {
    setRefreshingGrades(true);
    const result = await listGrades();
    setRefreshingGrades(false);

    if (result.error) {
      setPageError(result.error);
      return false;
    }
    setGrades(result.data);
    return true;
  }

  async function refreshSections() {
    setRefreshingSections(true);
    const result = await listSections();
    setRefreshingSections(false);

    if (result.error) {
      setPageError(result.error);
      return false;
    }
    setSections(result.data);
    return true;
  }

  async function handleGradeSubmit(payload) {
    setSaving(true);
    setFormError(null);
    setPageError(null);

    const record = gradeDialog.record;
    const result = record ? await updateGrade(record.grade_id, payload) : await createGrade(payload);

    if (!result.ok) {
      setFormError(result.error ?? "Could not save this grade.");
      setSaving(false);
      return;
    }

    announceBusy("Updating grade levels…");
    const refreshed = await refreshGrades();
    setSaving(false);
    setGradeDialog({ open: false, record: null });
    if (refreshed) {
      announce(record ? `${payload.name} saved.` : `${payload.name} added.`);
    }
  }

  async function handleSectionSubmit(payload) {
    setSaving(true);
    setFormError(null);
    setPageError(null);

    const record = sectionDialog.record;
    const result = record
      ? await updateSection(record.section_id, payload)
      : await createSection(payload);

    if (!result.ok) {
      setFormError(result.error ?? "Could not save this section.");
      setSaving(false);
      return;
    }

    announceBusy("Updating class sections…");
    const refreshed = await refreshSections();
    setSaving(false);
    setSectionDialog({ open: false, record: null });
    if (refreshed) {
      announce(record ? `${payload.name} saved.` : `${payload.name} added.`);
    }
  }

  async function handleToggleGrade(grade) {
    const deactivating = grade.is_active !== false;
    setWorkingGradeId(grade.grade_id);
    setPageError(null);
    announceBusy(`${deactivating ? "Deactivating" : "Activating"} ${grade.name}…`);

    const result = deactivating
      ? await deleteGrade(grade.grade_id)
      : await updateGrade(grade.grade_id, { is_active: true });

    if (!result.ok) {
      setPageError(result.error ?? "Could not change this grade.");
      setNotice(null);
      setWorkingGradeId(null);
      return;
    }

    const refreshed = await refreshGrades();
    setWorkingGradeId(null);
    if (refreshed) {
      announce(`${grade.name} ${deactivating ? "deactivated" : "activated"}.`);
    }
  }

  async function handleToggleSection(section) {
    const deactivating = section.is_active !== false;
    setWorkingSectionId(section.section_id);
    setPageError(null);
    announceBusy(`${deactivating ? "Deactivating" : "Activating"} ${section.name}…`);

    const result = deactivating
      ? await deleteSection(section.section_id)
      : await updateSection(section.section_id, { is_active: true });

    if (!result.ok) {
      setPageError(result.error ?? "Could not change this section.");
      setNotice(null);
      setWorkingSectionId(null);
      return;
    }

    const refreshed = await refreshSections();
    setWorkingSectionId(null);
    if (refreshed) {
      announce(`${section.name} ${deactivating ? "deactivated" : "activated"}.`);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <GraduationCap aria-hidden="true" className="size-3.5" />
          School directory
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
          Grades and Sections
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Maintain the grade levels and class sections that organize the school directory.
        </p>
      </header>

      {pageError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm break-words text-destructive"
        >
          {pageError}
        </p>
      ) : null}

      {initialError ? (
        <p className="max-w-prose rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-secondary-foreground">
          The latest directory could not be loaded, so grades and sections below may be out of date.
        </p>
      ) : null}

      {/* Reserved height, so an arriving message never pushes the panels down. */}
      <p
        role="status"
        aria-live="polite"
        className="-mt-4 min-h-5 text-sm text-muted-foreground"
        data-testid="directory-status"
      >
        {notice}
      </p>

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
        {/* Grade levels */}
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-foreground">
                Grade Levels
              </h2>
              <Button
                size="sm"
                onClick={() => {
                  setFormError(null);
                  setGradeDialog({ open: true, record: null });
                }}
              >
                <Plus aria-hidden="true" />
                Add grade
              </Button>
            </div>

            {grades.length === 0 ? (
              <EmptyState message="No grade levels yet. Add the first one to begin organizing sections." />
            ) : (
              <ul
                aria-busy={refreshingGrades || undefined}
                className={`space-y-2 transition-opacity ${refreshingGrades ? "opacity-60" : ""}`}
              >
                {grades.map((grade) => (
                  <DirectoryRow
                    key={grade.grade_id}
                    label={grade.name}
                    meta={`Level ${grade.level}`}
                    active={grade.is_active !== false}
                    onEdit={() => {
                      setFormError(null);
                      setGradeDialog({ open: true, record: grade });
                    }}
                    onToggle={() => handleToggleGrade(grade)}
                    working={workingGradeId === grade.grade_id}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Class sections */}
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-foreground">
                Class Sections
              </h2>
              <Button
                size="sm"
                onClick={() => {
                  setFormError(null);
                  setSectionDialog({ open: true, record: null });
                }}
              >
                <Plus aria-hidden="true" />
                Add section
              </Button>
            </div>

            {sections.length === 0 ? (
              <EmptyState message="No sections yet. Add a section to a grade level." />
            ) : (
              <ul
                aria-busy={refreshingSections || undefined}
                className={`space-y-2 transition-opacity ${refreshingSections ? "opacity-60" : ""}`}
              >
                {sections.map((section) => {
                  const gradeName =
                    grades.find((grade) => grade.grade_id === section.grade_id)?.name ??
                    section.grade_id;
                  const adviserName = section.adviser_id
                    ? (advisers[section.adviser_id] ?? "Assigned")
                    : null;
                  return (
                    <DirectoryRow
                      key={section.section_id}
                      label={`${section.name} (${gradeName})`}
                      meta={adviserName ? `Adviser: ${adviserName}` : "No adviser"}
                      active={section.is_active !== false}
                      onEdit={() => {
                        setFormError(null);
                        setSectionDialog({ open: true, record: section });
                      }}
                      onToggle={() => handleToggleSection(section)}
                      working={workingSectionId === section.section_id}
                    />
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <GradeFormDialog
        grade={gradeDialog.record}
        open={gradeDialog.open}
        onOpenChange={(open) => {
          if (!open) setGradeDialog((current) => ({ ...current, open: false }));
        }}
        onSubmit={handleGradeSubmit}
        busy={saving}
        error={formError}
      />

      <SectionFormDialog
        section={sectionDialog.record}
        grades={grades}
        advisers={advisers}
        open={sectionDialog.open}
        onOpenChange={(open) => {
          if (!open) setSectionDialog((current) => ({ ...current, open: false }));
        }}
        onSubmit={handleSectionSubmit}
        busy={saving}
        error={formError}
      />
    </div>
  );
}
