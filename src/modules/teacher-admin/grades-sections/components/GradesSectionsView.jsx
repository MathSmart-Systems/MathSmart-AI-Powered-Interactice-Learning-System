"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import {
  createSection,
  deleteGrade,
  deleteSection,
  listGrades,
  listSections,
  updateGrade,
  updateSection,
} from "../services/api";
import { MVP_GRADE_NAME, gradeNameFor, partitionDirectory } from "../utils/grade-scope";
import { DirectoryRow, EmptyState } from "./DirectoryRow";
import { GradeFormDialog } from "./GradeFormDialog";
import { OutOfScopePanel } from "./OutOfScopePanel";
import { SectionFormDialog } from "./SectionFormDialog";

/** How long a completed-action message stays before it clears itself. */
const NOTICE_TIMEOUT_MS = 6000;

/**
 * The Grades & Sections workspace.
 *
 * MathSmart teaches one grade, so this manages the Grade 6 record and the
 * sections under it. There is no way to add a second grade level here, because
 * there is no second curriculum behind it — the API refuses one too.
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

  const [gradeDialogOpen, setGradeDialogOpen] = useState(false);
  const [sectionDialog, setSectionDialog] = useState({
    open: false,
    record: null,
  });

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

  const scope = useMemo(() => partitionDirectory({ grades, sections }), [grades, sections]);

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
    if (!scope.grade) return;

    setSaving(true);
    setFormError(null);
    setPageError(null);

    const result = await updateGrade(scope.grade.grade_id, payload);

    if (!result.ok) {
      setFormError(result.error ?? "Could not save this grade.");
      setSaving(false);
      return;
    }

    announceBusy("Updating the grade level…");
    const refreshed = await refreshGrades();
    setSaving(false);
    setGradeDialogOpen(false);
    if (refreshed) {
      announce(`${payload.name} saved.`);
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
    announceBusy(`${deactivating ? "Retiring" : "Restoring"} ${grade.name}…`);

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

  const gradeName = scope.grade?.name ?? MVP_GRADE_NAME;

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
          MathSmart teaches the DepEd {MVP_GRADE_NAME} mathematics curriculum, so {MVP_GRADE_NAME}{" "}
          is the one grade level. Organise its class sections here.
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
        {/* The one grade level */}
        <section aria-labelledby="grade-level-heading">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2
                  id="grade-level-heading"
                  className="font-display text-base font-semibold text-foreground"
                >
                  Grade Level
                </h2>
                <span className="rounded-full border border-border bg-background/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Fixed by the curriculum
                </span>
              </div>

              {scope.grade ? (
                <ul className="@container space-y-2">
                  <DirectoryRow
                    label={scope.grade.name}
                    meta={`Level ${scope.grade.level}`}
                    active={scope.grade.is_active !== false}
                    onEdit={() => {
                      setFormError(null);
                      setGradeDialogOpen(true);
                    }}
                  />
                </ul>
              ) : (
                <EmptyState
                  message={`The ${MVP_GRADE_NAME} record is missing from the directory. Restore it from the database seed before adding sections.`}
                />
              )}

              <p className="text-xs leading-relaxed text-muted-foreground">
                There is no second grade level to add. Every competency, module and assessment in
                MathSmart belongs to {MVP_GRADE_NAME}.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Class sections */}
        <section aria-labelledby="class-sections-heading">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2
                  id="class-sections-heading"
                  className="font-display text-base font-semibold text-foreground"
                >
                  Class Sections
                </h2>
                <Button
                  size="sm"
                  disabled={!scope.grade}
                  onClick={() => {
                    setFormError(null);
                    setSectionDialog({ open: true, record: null });
                  }}
                >
                  <Plus aria-hidden="true" />
                  Add section
                </Button>
              </div>

              {scope.sections.length === 0 ? (
                <EmptyState
                  message={`No ${gradeName} sections yet. Add the first one to start assigning learners.`}
                />
              ) : (
                <ul
                  aria-busy={refreshingSections || undefined}
                  className={`@container space-y-2 transition-opacity ${
                    refreshingSections ? "opacity-60" : ""
                  }`}
                >
                  {scope.sections.map((section) => {
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
        </section>
      </div>

      <OutOfScopePanel
        grades={scope.outOfScopeGrades}
        sections={scope.outOfScopeSections}
        allGrades={grades}
        gradeNameFor={gradeNameFor}
        onRetireGrade={handleToggleGrade}
        onRetireSection={handleToggleSection}
        workingGradeId={workingGradeId}
        workingSectionId={workingSectionId}
        busy={refreshingGrades}
      />

      <GradeFormDialog
        grade={scope.grade}
        open={gradeDialogOpen}
        onOpenChange={setGradeDialogOpen}
        onSubmit={handleGradeSubmit}
        busy={saving}
        error={formError}
      />

      <SectionFormDialog
        section={sectionDialog.record}
        grade={scope.grade}
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
