"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { diagnosticStatus, monitoringStatus } from "../utils/labels";
import { createStudent, listStudents, updateStudent } from "../services/api";
import { EnrollStudentDialog } from "./EnrollStudentDialog";
import { EditStudentDialog } from "./EditStudentDialog";

function StatusPill({ status }) {
  return <Badge variant={status.variant}>{status.label}</Badge>;
}

function EmptyState({ message }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-background/50 px-4 py-6 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

const FILTER_STYLE =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * The Teacher/Administrator Students workspace.
 *
 * The initial roster, grade directory and section directory arrive from the
 * server component (so the page is useful on first paint) and every filter
 * change or enrolment mutation refreshes them through the API. Search happens
 * on the already-loaded roster; grade and section filters are sent to the API.
 */
export function StudentsView({ initialLearners, initialGrades, initialSections, initialError, initialTruncated }) {
  const [learners, setLearners] = useState(initialLearners);
  const [grades, setGrades] = useState(initialGrades);
  const [sections, setSections] = useState(initialSections);
  const [rosterTruncated, setRosterTruncated] = useState(Boolean(initialTruncated));
  const [pageError, setPageError] = useState(null);

  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [filtering, setFiltering] = useState(false);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const gradeById = useMemo(() => {
    const map = new Map();
    for (const grade of grades) map.set(grade.grade_id, grade);
    return map;
  }, [grades]);

  const sectionById = useMemo(() => {
    const map = new Map();
    for (const section of sections) map.set(section.section_id, section);
    return map;
  }, [sections]);

  function gradeName(gradeId) {
    return gradeById.get(gradeId)?.name ?? null;
  }

  function sectionName(sectionId) {
    return sectionById.get(sectionId)?.name ?? null;
  }

  /** Sections that may be picked next to the current grade filter. */
  const sectionsForGrade = useMemo(
    () => (gradeFilter ? sections.filter((section) => section.grade_id === gradeFilter) : sections),
    [sections, gradeFilter]
  );

  const visibleLearners = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return learners;
    return learners.filter((learner) => {
      const name = (learner.full_name ?? "").toLowerCase();
      const lrn = (learner.learner_id ?? "").toLowerCase();
      return name.includes(query) || lrn.includes(query);
    });
  }, [learners, search]);

  function failAction(message) {
    setPageError(message);
  }

  async function fetchRoster({ gradeId = gradeFilter, sectionId = sectionFilter }) {
    setFiltering(true);
    setPageError(null);
    const result = await listStudents({ gradeId: gradeId || null, sectionId: sectionId || null });
    setFiltering(false);

    if (result.error) {
      failAction(result.error);
      return;
    }
    setLearners(result.data);
    setRosterTruncated(result.total > result.data.length);
  }

  function handleGradeFilterChange(nextGradeId) {
    setGradeFilter(nextGradeId);
    const nextSection = sectionFilter && sectionsForGrade.some((s) => s.section_id === sectionFilter) ? sectionFilter : "";
    setSectionFilter(nextSection);
    fetchRoster({
      gradeId: nextGradeId || null,
      sectionId: nextSection || null,
    });
  }

  function handleSectionFilterChange(nextSectionId) {
    setSectionFilter(nextSectionId);
    fetchRoster({ sectionId: nextSectionId || null });
  }

  async function handleEnrollSubmit(payload) {
    setSaving(true);
    setFormError(null);
    setPageError(null);

    const result = await createStudent(payload);

    if (!result.ok) {
      setFormError(result.error ?? "Could not enroll this student.");
      setSaving(false);
      return;
    }

    await fetchRoster({});
    setSaving(false);
    setEnrollOpen(false);
  }

  async function handleEditSubmit(payload) {
    setSaving(true);
    setFormError(null);
    setPageError(null);

    const result = await updateStudent(editRecord.student_id, payload);

    if (!result.ok) {
      setFormError(result.error ?? "Could not update this student.");
      setSaving(false);
      return;
    }

    await fetchRoster({});
    setSaving(false);
    setEditRecord(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Users aria-hidden="true" className="size-3.5" />
          Student records
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Students
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Enrol learners and keep their grade and section placement up to date.
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
          The latest roster could not be loaded, so the list below may be out of date.
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-foreground">Student roster</h2>
          <Button
            size="sm"
            onClick={() => {
              setFormError(null);
              setEnrollOpen(true);
            }}
          >
            <Plus aria-hidden="true" />
            Enroll student
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:grid sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-foreground" htmlFor="students-search">
              Search
            </label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="students-search"
                className="pl-9"
                placeholder="Search by student name or LRN…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-foreground" htmlFor="students-grade-filter">
              Grade
            </label>
            <select
              id="students-grade-filter"
              className={FILTER_STYLE}
              value={gradeFilter}
              onChange={(event) => handleGradeFilterChange(event.target.value)}
              disabled={filtering}
              aria-label="Filter by grade level"
            >
              <option value="">All grades</option>
              {grades.map((grade) => (
                <option key={grade.grade_id} value={grade.grade_id}>
                  {grade.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-foreground" htmlFor="students-section-filter">
              Section
            </label>
            <select
              id="students-section-filter"
              className={FILTER_STYLE}
              value={sectionFilter}
              onChange={(event) => handleSectionFilterChange(event.target.value)}
              disabled={filtering || sectionsForGrade.length === 0}
              aria-label="Filter by class section"
            >
              <option value="">All sections</option>
              {sectionsForGrade.map((section) => {
                const grade = gradeName(section.grade_id);
                return (
                  <option key={section.section_id} value={section.section_id}>
                    {grade ? `${section.name} (${grade})` : section.name}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {rosterTruncated ? (
          <p className="text-xs text-muted-foreground">
            Showing the first {learners.length} enrolled learners. Search or filter to narrow the list.
          </p>
        ) : null}
      </div>

      {visibleLearners.length === 0 ? (
        <EmptyState
          message={
            learners.length === 0
              ? "No enrolled learners yet. Enrol the first student to begin building your roster."
              : "No learners match that search or those filters."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Enrolled students</caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Student
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Class section
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Diagnostic
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleLearners.map((learner) => {
                  const grade = gradeName(learner.grade_id);
                  const section = sectionName(learner.section_id);
                  return (
                    <tr key={learner.student_id} className="hover:bg-secondary/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{learner.full_name ?? "Unnamed learner"}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{learner.learner_id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-foreground">{grade ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {section ? `Section ${section}` : "No section assigned"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={diagnosticStatus(learner.diagnostic_status)} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={monitoringStatus(learner.monitoring_status)} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-8"
                          onClick={() => {
                            setFormError(null);
                            setEditRecord(learner);
                          }}
                          aria-label={`Edit ${learner.full_name ?? "student"}`}
                        >
                          <Pencil aria-hidden="true" className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <EnrollStudentDialog
        grades={grades}
        sections={sections}
        open={enrollOpen}
        onOpenChange={(open) => {
          if (!open) setEnrollOpen(false);
        }}
        onSubmit={handleEnrollSubmit}
        busy={saving}
        error={formError}
      />

      <EditStudentDialog
        student={editRecord}
        grades={grades}
        sections={sections}
        open={Boolean(editRecord)}
        onOpenChange={(open) => {
          if (!open) setEditRecord(null);
        }}
        onSubmit={handleEditSubmit}
        busy={saving}
        error={formError}
      />
    </div>
  );
}