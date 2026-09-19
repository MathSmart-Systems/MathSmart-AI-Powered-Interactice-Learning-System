"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Search, Users } from "lucide-react";

const PREFS_KEY = "mathsmart.teacher_preferences";

/**
 * Reads the teacher's density preference ("comfortable" | "compact") from
 * localStorage. Falls back to "comfortable" when missing or unreadable.
 *
 * @returns {"comfortable" | "compact"}
 */
function readDensity() {
  if (typeof window === "undefined") return "comfortable";
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.density === "compact") return "compact";
    }
  } catch {
    // Graceful fallback
  }
  return "comfortable";
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { diagnosticStatus, monitoringStatus } from "../utils/labels";
import { createStudent, listStudents, updateStudent } from "../services/api";
import {
  MVP_GRADE_NAME,
  assignableSections,
  learnerName,
  mvpGrade,
  rosterTruncationMessage,
} from "../utils/roster";
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
 * change or enrollment mutation refreshes them through the API. Search happens
 * on the already-loaded roster; the section filter is sent to the API.
 */
export function StudentsView({ initialLearners, initialGrades, initialSections, initialError, initialTruncated, initialTotal = 0 }) {
  const [learners, setLearners] = useState(initialLearners);
  const [grades, setGrades] = useState(initialGrades);
  const [sections, setSections] = useState(initialSections);
    // The API's own count of the whole roster, not the size of the page it
  // returned. The difference is what the truncation line reports.
  const [rosterTotal, setRosterTotal] = useState(
    Number(initialTotal) || (initialTruncated ? initialLearners.length : 0),
  );
  const [pageError, setPageError] = useState(null);

  // Density preference: read on mount and listen for live changes from Settings > Display.
  const [density, setDensity] = useState(() => readDensity());

  useEffect(() => {
    const handleDensityChange = (e) => {
      if (e.detail?.density) {
        setDensity(e.detail.density);
      } else {
        setDensity(readDensity());
      }
    };
    window.addEventListener("mathsmart:theme-change", handleDensityChange);
    return () => window.removeEventListener("mathsmart:theme-change", handleDensityChange);
  }, []);

  const rowPadding = density === "compact" ? "px-4 py-2" : "px-4 py-3";
  const headPadding = density === "compact" ? "px-4 py-2" : "px-4 py-3";

  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [filtering, setFiltering] = useState(false);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const sectionById = useMemo(() => {
    const map = new Map();
    for (const section of sections) map.set(section.section_id, section);
    return map;
  }, [sections]);

  function sectionName(sectionId) {
    return sectionById.get(sectionId)?.name ?? null;
  }

  const visibleLearners = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return learners;
    return learners.filter((learner) => {
      const name = (learner.full_name ?? "").toLowerCase();
      const lrn = (learner.learner_id ?? "").toLowerCase();
      return name.includes(query) || lrn.includes(query);
    });
  }, [learners, search]);

  // Reported from the API's own total, so a page of 100 out of 412 says 412.
  // Searching narrows what is on screen without changing what the roster holds,
  // so the message follows the loaded page rather than the filtered view.
  const truncationMessage = rosterTruncationMessage(learners.length, rosterTotal);

  // MathSmart teaches one grade, so there is nothing to filter by and nothing
  // to choose. Everything below works from this record, and says so plainly
  // when the deployment is missing it.
  const grade = useMemo(() => mvpGrade(grades), [grades]);
  const gradeSections = useMemo(() => assignableSections(sections, grade), [sections, grade]);

  function failAction(message) {
    setPageError(message);
  }

  async function fetchRoster({ sectionId = sectionFilter } = {}) {
    // The grade is never a filter: every learner in the roster is in the one
    // grade MathSmart teaches.
    setFiltering(true);
    setPageError(null);
    const result = await listStudents({ sectionId: sectionId || null });
    setFiltering(false);

    if (result.error) {
      failAction(result.error);
      return;
    }
    setLearners(result.data);
    setRosterTotal(result.total);
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
          {grade?.name ?? MVP_GRADE_NAME}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
          Students
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Enroll learners and keep their section placement up to date.
        </p>
      </header>

      {!grade ? (
        <p
          role="alert"
          className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          The {MVP_GRADE_NAME} record is missing from this deployment, so a learner has nothing to
          be enrolled into. Restore it from the database seed before enrolling anyone.
        </p>
      ) : null}

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-foreground">Student roster</h2>
          <Button
            size="sm"
            disabled={!grade}
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
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-foreground" htmlFor="students-section-filter">
              Section
            </label>
            <select
              id="students-section-filter"
              className={FILTER_STYLE}
              value={sectionFilter}
              onChange={(event) => handleSectionFilterChange(event.target.value)}
              disabled={filtering || gradeSections.length === 0}
              aria-label="Filter by class section"
            >
              <option value="">All sections</option>
              {gradeSections.map((section) => (
                <option key={section.section_id} value={section.section_id}>
                  {section.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {truncationMessage ? (
          <p role="status" className="text-xs text-muted-foreground">
            {truncationMessage}
          </p>
        ) : null}
      </div>

      {visibleLearners.length === 0 ? (
        <EmptyState
          message={
            learners.length === 0
              ? "No enrolled learners yet. Enroll the first student to begin building your roster."
              : "No learners match that search or those filters."
          }
        />
      ) : (
        <div className="relative overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Enrolled students</caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className={`${headPadding} font-semibold`}>
                    Student
                  </th>
                  <th scope="col" className={`${headPadding} hidden font-semibold sm:table-cell`}>
                    Class section
                  </th>
                  <th scope="col" className={`${headPadding} hidden font-semibold sm:table-cell`}>
                    Diagnostic
                  </th>
                  <th scope="col" className={`${headPadding} font-semibold`}>
                    Status
                  </th>
                  <th scope="col" className={`${headPadding} text-right font-semibold`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleLearners.map((learner) => {
                  const section = sectionName(learner.section_id);
                  return (
                    <tr key={learner.student_id} className="hover:bg-secondary/40">
                      <td className={rowPadding}>
                        {/*
                         * The name is the way into the learner's record: a link
                         * rather than a row click, so it is reachable by
                         * keyboard, announced as a link, and openable in a new
                         * tab like any other.
                         */}
                        <Link
                          href={`/teacher/students/${learner.student_id}`}
                          className="rounded-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          {learnerName(learner)}
                        </Link>
                        <p className="font-mono text-[11px] text-muted-foreground">{learner.learner_id}</p>
                        {/*
                         * The two columns hidden on a narrow screen, said once
                         * here instead, so nothing is lost and nothing scrolls.
                         */}
                        <p className="text-[11px] text-muted-foreground sm:hidden">
                          {section ?? "No section assigned"} ·{" "}
                          {diagnosticStatus(learner.diagnostic_status).label}
                        </p>
                      </td>
                      {/*
                       * The grade is not a column. Every learner on this page
                       * is in the one grade MathSmart teaches, so repeating it
                       * on every row would say nothing.
                       */}
                      <td className={`${rowPadding} hidden sm:table-cell`}>
                        <p className="text-foreground">{section ?? "No section assigned"}</p>
                      </td>
                      <td className={`${rowPadding} hidden sm:table-cell`}>
                        <StatusPill status={diagnosticStatus(learner.diagnostic_status)} />
                      </td>
                      <td className={rowPadding}>
                        <StatusPill status={monitoringStatus(learner.monitoring_status)} />
                      </td>
                      <td className={`${rowPadding} text-right`}>
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
        grade={grade}
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
        grade={grade}
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