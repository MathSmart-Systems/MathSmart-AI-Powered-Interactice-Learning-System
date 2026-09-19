"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import {
  createSection,
  deleteSection,
  destroySection,
  listAdvisers,
  listGrades,
  listSections,
  updateSection,
} from "../services/api";
import { MVP_GRADE_NAME, partitionDirectory } from "../utils/grade-scope";
import { DeleteSectionDialog } from "./DeleteSectionDialog";
import { DirectoryRow, EmptyState } from "./DirectoryRow";
import { SectionFormDialog } from "./SectionFormDialog";

/** How long a completed-action message stays before it clears itself. */
const NOTICE_TIMEOUT_MS = 6000;

/**
 * The Class Sections workspace.
 *
 * MathSmart teaches one grade, so there is no grade level to manage here —
 * only the sections inside it. The grade is context, shown once as a badge,
 * and the server is what puts a section in it: the request has no field for a
 * grade at all.
 *
 * Records belonging to a grade the product does not teach are left out
 * entirely. They stay in the database; there is simply no curriculum behind
 * them for this workspace to manage.
 *
 * The initial list arrives from the server component (so the page is useful on
 * first paint) and every mutation refreshes it through the API. A refresh
 * keeps the rows it already has on screen — a list that blanks itself after
 * every save is harder to follow than one that dims for a moment.
 */
export function GradesSectionsView({
  initialGrades,
  initialSections,
  advisers: initialAdvisers,
  initialError,
}) {
  const [grades, setGrades] = useState(initialGrades);
  const [sections, setSections] = useState(initialSections);
  const [advisers, setAdvisers] = useState(initialAdvisers);
  const [pageError, setPageError] = useState(null);

  const [sectionDialog, setSectionDialog] = useState({ open: false, record: null });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, record: null });
  const [deleteError, setDeleteError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [workingSectionId, setWorkingSectionId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // One live region for the whole page: a busy line while the list is being
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

  /**
   * Re-reads everything the page shows, together.
   *
   * The sections are what changed, but which of them this page shows depends
   * on the grade record they point at, and how it names each one depends on
   * the adviser directory. Reading one without the others lets them drift — a
   * freshly created section vanishes because the page is still holding the
   * grade list it was rendered with, or its adviser reads as "Assigned"
   * because the name arrived after the list did.
   */
  async function refreshDirectory() {
    setRefreshing(true);
    const [gradeResult, sectionResult, adviserResult] = await Promise.all([
      listGrades(),
      listSections(),
      listAdvisers(),
    ]);
    setRefreshing(false);

    if (sectionResult.error) {
      setPageError(sectionResult.error);
      return false;
    }
    if (!gradeResult.error) setGrades(gradeResult.data);
    if (!adviserResult.error) setAdvisers(adviserResult.data);
    setSections(sectionResult.data);
    return true;
  }

  async function handleSubmit(payload) {
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
    const refreshed = await refreshDirectory();
    setSaving(false);
    setSectionDialog({ open: false, record: null });
    if (refreshed) {
      announce(record ? `${payload.name} saved.` : `${payload.name} added.`);
    }
  }

  async function handleToggle(section) {
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

    const refreshed = await refreshDirectory();
    setWorkingSectionId(null);
    if (refreshed) {
      announce(`${section.name} ${deactivating ? "deactivated" : "activated"}.`);
    }
  }

  /**
   * Removes a retired section for good.
   *
   * The only action here that cannot be taken back, so it is reached through
   * its own confirmation and only from a row that is already deactivated. A
   * refusal stays in the dialog, where the person can read it and decide,
   * rather than closing over the top of it.
   */
  async function handleDelete() {
    const section = deleteDialog.record;
    if (!section) return;

    setDeleting(true);
    setDeleteError(null);
    setPageError(null);
    announceBusy(`Deleting ${section.name}…`);

    const result = await destroySection(section.section_id);

    if (!result.ok) {
      setDeleteError(result.error ?? "Could not delete this section.");
      setDeleting(false);
      setNotice(null);
      return;
    }

    const refreshed = await refreshDirectory();
    setDeleting(false);
    setDeleteDialog({ open: false, record: null });
    if (refreshed) {
      announce(`${section.name} deleted.`);
    }
  }

  // Without the grade record there is nothing for a section to belong to, and
  // the API says so too. The page stays readable and the control stands down.
  const gradeMissing = !scope.grade;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <GraduationCap aria-hidden="true" className="size-3.5" />
          {scope.grade?.name ?? MVP_GRADE_NAME}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
          Class Sections
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          The classes your learners are grouped into, and the adviser looking after each one.
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
          The latest list could not be loaded, so the sections below may be out of date.
        </p>
      ) : null}

      {gradeMissing ? (
        <p
          role="alert"
          className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          The {MVP_GRADE_NAME} record is missing from this deployment, so a section has nothing to
          belong to. Restore it from the database seed before adding one.
        </p>
      ) : null}

      {/* Reserved height, so an arriving message never pushes the list down. */}
      <p
        role="status"
        aria-live="polite"
        className="-mt-4 min-h-5 text-sm text-muted-foreground"
        data-testid="directory-status"
      >
        {notice}
      </p>

      <section aria-labelledby="class-sections-heading">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="class-sections-heading"
                className="font-display text-base font-semibold text-foreground"
              >
                Sections
              </h2>
              <Button
                size="sm"
                disabled={gradeMissing}
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
              <EmptyState message="No sections yet. Add the first one to start assigning learners." />
            ) : (
              <ul
                aria-busy={refreshing || undefined}
                className={`@container space-y-2 transition-opacity ${
                  refreshing ? "opacity-60" : ""
                }`}
              >
                {scope.sections.map((section) => {
                  const adviserName = section.adviser_id
                    ? (advisers[section.adviser_id] ?? "Assigned")
                    : null;
                  return (
                    <DirectoryRow
                      key={section.section_id}
                      label={section.name}
                      meta={adviserName ? `Adviser: ${adviserName}` : "No adviser"}
                      active={section.is_active !== false}
                      onEdit={() => {
                        setFormError(null);
                        setSectionDialog({ open: true, record: section });
                      }}
                      onToggle={() => handleToggle(section)}
                      onDelete={() => {
                        setDeleteError(null);
                        setDeleteDialog({ open: true, record: section });
                      }}
                      working={workingSectionId === section.section_id}
                    />
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <SectionFormDialog
        section={sectionDialog.record}
        grade={scope.grade}
        advisers={advisers}
        open={sectionDialog.open}
        onOpenChange={(open) => {
          if (!open) setSectionDialog((current) => ({ ...current, open: false }));
        }}
        onSubmit={handleSubmit}
        busy={saving}
        error={formError}
      />

      <DeleteSectionDialog
        section={deleteDialog.record}
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog((current) => ({ ...current, open: false }));
        }}
        onConfirm={handleDelete}
        busy={deleting}
        error={deleteError}
      />
    </div>
  );
}
