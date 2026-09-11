"use client";

import { useState } from "react";
import { GraduationCap, Pencil, Plus, Power } from "lucide-react";

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
 * A single bordered row, matching the reference workspace panels: a bold name
 * on the left, status and a compact action set on the right.
 */
function DirectoryRow({ label, meta, active, onEdit, onToggle, working, editLabel, toggleLabel }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{label}</p>
        {meta ? <p className="truncate text-[11px] text-muted-foreground">{meta}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <StatusPill active={active} />
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="size-7" onClick={onEdit}>
            <Pencil aria-hidden="true" className="size-3.5" />
            <span className="sr-only">{editLabel}</span>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={onToggle}
            disabled={working}
            aria-label={working ? "Working…" : toggleLabel}
          >
            <Power aria-hidden="true" className="size-3.5" />
            <span className="sr-only">{toggleLabel}</span>
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * The Grades & Sections workspace.
 *
 * The initial lists arrive from the server component (so the page is useful on
 * first paint) and every mutation refreshes them through the API.
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

  function failAction(message) {
    setPageError(message);
  }

  async function refreshGrades() {
    const result = await listGrades();
    if (result.error) {
      failAction(result.error);
      return;
    }
    setGrades(result.data);
  }

  async function refreshSections() {
    const result = await listSections();
    if (result.error) {
      failAction(result.error);
      return;
    }
    setSections(result.data);
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

    await refreshGrades();
    setSaving(false);
    setGradeDialog({ open: false, record: null });
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

    await refreshSections();
    setSaving(false);
    setSectionDialog({ open: false, record: null });
  }

  async function handleToggleGrade(grade) {
    setWorkingGradeId(grade.grade_id);
    setPageError(null);

    const result = grade.is_active
      ? await deleteGrade(grade.grade_id)
      : await updateGrade(grade.grade_id, { is_active: true });

    if (!result.ok) {
      setPageError(result.error ?? "Could not change this grade.");
    } else {
      await refreshGrades();
    }
    setWorkingGradeId(null);
  }

  async function handleToggleSection(section) {
    setWorkingSectionId(section.section_id);
    setPageError(null);

    const result = section.is_active
      ? await deleteSection(section.section_id)
      : await updateSection(section.section_id, { is_active: true });

    if (!result.ok) {
      setPageError(result.error ?? "Could not change this section.");
    } else {
      await refreshSections();
    }
    setWorkingSectionId(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <GraduationCap aria-hidden="true" className="size-3.5" />
          School directory
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
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
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {pageError}
        </p>
      ) : null}

      {initialError ? (
        <p className="max-w-prose rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-secondary-foreground">
          The latest directory could not be loaded, so grades and sections below may be out of date.
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
        {/* Grade levels */}
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
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
              <ul className="space-y-2">
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
                    editLabel={`Edit ${grade.name}`}
                    toggleLabel={grade.is_active !== false ? `Deactivate ${grade.name}` : `Activate ${grade.name}`}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Class sections */}
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
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
              <ul className="space-y-2">
                {sections.map((section) => {
                  const gradeName =
                    grades.find((grade) => grade.grade_id === section.grade_id)?.name ??
                    section.grade_id;
                  const adviserName = section.adviser_id
                    ? advisers[section.adviser_id] ?? "Assigned"
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
                      editLabel={`Edit ${section.name}`}
                      toggleLabel={section.is_active !== false ? `Deactivate ${section.name}` : `Activate ${section.name}`}
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