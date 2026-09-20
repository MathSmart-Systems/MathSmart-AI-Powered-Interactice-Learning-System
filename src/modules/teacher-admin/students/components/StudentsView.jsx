"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RotateCcw, Search, Trash2, UserMinus, Users } from "lucide-react";

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

import { diagnosticStatus, isDropped, learnerStatus } from "../utils/labels";
import {
  createStudent,
  dropStudents,
  listStudents,
  previewPurge,
  purgeStudent,
  restoreStudent,
  updateStudent,
} from "../services/api";
import {
  MVP_GRADE_NAME,
  ROSTER_STATUS,
  ROSTER_STATUS_OPTIONS,
  assignableSections,
  groupBySection,
  learnerName,
  mvpGrade,
  rosterTruncationMessage,
  sectionCountLabel,
} from "../utils/roster";
import {
  dropRequests,
  dropSummary,
  emptySelection,
  enrolledIn,
  hasSelection,
  isLearnerSelected,
  isSectionSelected,
  rowLocked,
  sectionKey,
  selectionSize,
  toggleLearner,
  toggleSection,
  toggleSectionRows,
  withLoadedFloor,
} from "../utils/drop-selection";
import { EnrollStudentDialog } from "./EnrollStudentDialog";
import { DropStudentDialog } from "./DropStudentDialog";
import { EditStudentDialog } from "./EditStudentDialog";
import { PurgeStudentDialog } from "./PurgeStudentDialog";
import { RestoreStudentDialog, returnsToFormerSection } from "./RestoreStudentDialog";
import { StudentRowActions } from "./StudentRowActions";

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

/** What an empty roster means depends on what was asked for. */
const EMPTY_MESSAGE = Object.freeze({
  enrolled: "No enrolled learners yet. Enroll the first student to begin building your roster.",
  dropped: "No learners have been dropped.",
  all: "No learners on the roster yet.",
});

const CHECKBOX_STYLE =
  "size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

/**
 * A checkbox that can also sit between checked and unchecked.
 *
 * `indeterminate` is a DOM property rather than an attribute, so it is set on
 * the node. A section with some of its learners picked is exactly that state,
 * and showing it as plain unchecked would misreport the selection.
 */
function SelectBox({ indeterminate = false, className = "", ...props }) {
  return (
    <input
      type="checkbox"
      ref={(node) => {
        if (node) node.indeterminate = indeterminate;
      }}
      className={`${CHECKBOX_STYLE} ${className}`}
      {...props}
    />
  );
}

/**
 * The Teacher/Administrator Students workspace.
 *
 * The initial roster, grade directory and section directory arrive from the
 * server component (so the page is useful on first paint) and every filter
 * change or enrollment mutation refreshes them through the API. Search happens
 * on the already-loaded roster; the section filter is sent to the API.
 *
 * The roster is grouped by class section rather than shown flat, because the
 * section is the unit a teacher actually works in: at the end of a school year
 * they clear a class, not a list. Each section can therefore be selected
 * whole, and that selection is sent as a section id — never as the learner ids
 * on screen, which are only the first page of it.
 */
export function StudentsView({
  initialLearners,
  initialGrades,
  initialSections,
  initialSectionCounts = [],
  initialError,
  initialTruncated,
  initialTotal = 0,
}) {
  const [learners, setLearners] = useState(initialLearners);
  const [grades, setGrades] = useState(initialGrades);
  const [sections, setSections] = useState(initialSections);
    // The API's own count of the whole roster, not the size of the page it
  // returned. The difference is what the truncation line reports.
  const [rosterTotal, setRosterTotal] = useState(
    Number(initialTotal) || (initialTruncated ? initialLearners.length : 0),
  );
  // Per-section totals, counted by the API across the whole roster. A section
  // header says this number, not the number of rows beneath it.
  const [sectionCounts, setSectionCounts] = useState(initialSectionCounts);
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
  const [statusFilter, setStatusFilter] = useState(ROSTER_STATUS.ENROLLED);
  const [filtering, setFiltering] = useState(false);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // What is ticked, and what is about to be dropped. They are separate on
  // purpose: the edit dialog's Drop acts on one learner without disturbing a
  // selection the teacher may have been building.
  const [selection, setSelection] = useState(() => emptySelection());
  const [confirm, setConfirm] = useState(null);
  const [dropError, setDropError] = useState(null);
  const [dropping, setDropping] = useState(false);
  const [dropNotice, setDropNotice] = useState(null);

  const [restoreRecord, setRestoreRecord] = useState(null);
  const [restoreError, setRestoreError] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const [purgeRecord, setPurgeRecord] = useState(null);
  const [purgePreview, setPurgePreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [purgeError, setPurgeError] = useState(null);
  const [purging, setPurging] = useState(false);

  const sectionById = useMemo(() => {
    const map = new Map();
    for (const section of sections) map.set(section.section_id, section);
    return map;
  }, [sections]);

  function sectionName(sectionId) {
    return sectionById.get(sectionId)?.name ?? null;
  }

  const query = search.trim().toLowerCase();

  function matchesSearch(learner) {
    if (!query) return true;
    const name = (learner.full_name ?? "").toLowerCase();
    const lrn = (learner.learner_id ?? "").toLowerCase();
    return name.includes(query) || lrn.includes(query);
  }

  const visibleLearners = learners.filter(matchesSearch);

  // Reported from the API's own total, so a page of 100 out of 412 says 412.
  // Searching narrows what is on screen without changing what the roster holds,
  // so the message follows the loaded page rather than the filtered view.
  const truncationMessage = rosterTruncationMessage(learners.length, rosterTotal);

  // MathSmart teaches one grade, so there is nothing to filter by and nothing
  // to choose. Everything below works from this record, and says so plainly
  // when the deployment is missing it.
  const grade = useMemo(() => mvpGrade(grades), [grades]);
  const gradeSections = useMemo(() => assignableSections(sections, grade), [sections, grade]);

  // Grouped only by the active sections of the canonical Grade 6 record.
  //
  // Not by the section directory at large, and never by whatever section name
  // a learner row happens to carry: a legacy section from an earlier
  // deployment would otherwise become a heading on this roster purely because
  // one learner still points at it. A learner whose section is not one of
  // these keeps their row, under a heading that says what to do about it.
  const groups = useMemo(
    () => groupBySection(learners, gradeSections),
    [learners, gradeSections],
  );

  /** The learners of a section that this page has loaded and could still drop. */
  function droppableLoaded(group) {
    return group.learners.filter((learner) => !isDropped(learner));
  }

  /*
   * A whole section can only be acted on by id when the action has a
   * server-side section operation behind it, which is true of dropping and of
   * nothing else. Under any other view the rows on screen are what gets
   * selected, so the number in the bar is the number of names actually chosen.
   */
  const sectionWideDropAvailable = statusFilter === ROSTER_STATUS.ENROLLED;

  /** The rows of a section a teacher can act on in the current view. */
  function selectableLoaded(group) {
    if (statusFilter === ROSTER_STATUS.ENROLLED) return droppableLoaded(group);
    if (statusFilter === ROSTER_STATUS.DROPPED) return group.learners.filter(isDropped);
    return group.learners;
  }

  // What is selected decides what can be done with it. A selection of dropped
  // learners offers restore and purge; one of enrolled learners offers drop;
  // and a mixture offers neither, because neither would be true of all of it.
  const selectedLearners = learners.filter((learner) => selection.users.has(learner.user_id));
  const selectionIsDropped =
    selection.sections.size === 0 &&
    selectedLearners.length > 0 &&
    selectedLearners.every(isDropped);
  const selectionIsEnrolled =
    selection.sections.size > 0 ||
    (selectedLearners.length > 0 && selectedLearners.every((learner) => !isDropped(learner)));

  /**
   * The per-section counts, floored at what the page is actually showing.
   *
   * The API's count is the one to trust, because it sees the whole roster
   * rather than the first page. But it can be absent — an older reply, a
   * refresh that failed — and a heading reading "0 enrolled" above a list of
   * names is worse than a slightly low number. So the rows on screen set the
   * floor, and the selection, the confirmation and the heading all read from
   * this one place rather than each deciding for itself.
   */
  const effectiveCounts = withLoadedFloor(
    sectionCounts,
    groups.map((group) => ({
      section_id: group.sectionId,
      loaded: droppableLoaded(group).length,
    })),
  );

  const selectedCount = selectionSize(selection, effectiveCounts);
  const anySelected = hasSelection(selection);

  function failAction(message) {
    setPageError(message);
  }

  async function fetchRoster({ sectionId = sectionFilter, status = statusFilter } = {}) {
    // Every refresh asks by grade, exactly as the first server-rendered read
    // did. Leaving it off here is what would let a legacy learner reappear the
    // moment a teacher changed a filter.
    if (!grade) {
      setLearners([]);
      setRosterTotal(0);
      setSectionCounts([]);
      setSelection(emptySelection());
      return;
    }

    setFiltering(true);
    setPageError(null);
    const result = await listStudents({
      gradeId: grade.grade_id,
      sectionId: sectionId || null,
      status,
    });
    setFiltering(false);

    if (result.error) {
      failAction(result.error);
      return;
    }
    setLearners(result.data);
    setRosterTotal(result.total);
    setSectionCounts(result.sections);
    // The roster underneath a selection has just changed, so the selection no
    // longer describes anything the teacher can see.
    setSelection(emptySelection());
  }

  function handleSectionFilterChange(nextSectionId) {
    setSectionFilter(nextSectionId);
    fetchRoster({ sectionId: nextSectionId || null });
  }

  /**
   * Narrows the loaded page, and drops any selection it hides.
   *
   * A learner who has scrolled out of the search results is still a learner a
   * bulk action would act on, and the bar would keep counting them. Selection
   * follows what is on screen.
   */
  function handleSearchChange(next) {
    setSearch(next);

    const query = next.trim().toLowerCase();
    if (!query || !hasSelection(selection)) return;

    const stillVisible = new Set(
      learners
        .filter((learner) => {
          const name = (learner.full_name ?? "").toLowerCase();
          const lrn = (learner.learner_id ?? "").toLowerCase();
          return name.includes(query) || lrn.includes(query);
        })
        .map((learner) => learner.user_id),
    );

    setSelection({
      // A whole-section selection is resolved by the server and is not a list
      // of rows, so a search cannot make part of it invisible.
      sections: new Set(selection.sections),
      users: new Set([...selection.users].filter((id) => stillVisible.has(id))),
    });
  }

  function handleStatusChange(next) {
    setStatusFilter(next);
    fetchRoster({ status: next });
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

  /**
   * Drops whatever the confirmation was opened for.
   *
   * Archiving, not deleting: their recorded work is referenced by seven tables
   * and every one of those references refuses a delete, so the accounts are
   * retired and the history a class report is built from stays intact.
   *
   * A mixed selection needs more than one request, because the API takes one
   * target per call. If a later one fails, what the earlier ones already did
   * is reported rather than swallowed — the roster really has changed.
   */
  async function handleDrop() {
    if (!confirm) return;

    setDropping(true);
    setDropError(null);
    setPageError(null);
    setDropNotice(null);

    let dropped = 0;
    for (const target of confirm.requests) {
      const result = await dropStudents(target);
      if (!result.ok) {
        setDropError(
          dropped > 0
            ? `${result.error ?? "Could not drop those students."} ${dropped} ${
                dropped === 1 ? "student was" : "students were"
              } already dropped before this failed.`
            : (result.error ?? "Could not drop those students."),
        );
        setDropping(false);
        if (dropped > 0) await fetchRoster();
        return;
      }
      dropped += Number(result.data?.dropped) || 0;
    }

    await fetchRoster();
    setDropping(false);
    setConfirm(null);
    setEditRecord(null);
    setDropNotice(
      dropped === 0
        ? "Those learners had already been dropped."
        : `${dropped} ${dropped === 1 ? "student" : "students"} dropped.`,
    );
  }

  function confirmSelection() {
    setDropError(null);
    setConfirm({
      summary: dropSummary(selection, effectiveCounts, (key) => sectionName(key) ?? "that section"),
      count: selectedCount,
      requests: dropRequests(selection),
    });
  }

  /** Everything a restore or purge is about, as a list even when it is one. */
  function asList(target) {
    return Array.isArray(target) ? target : [target];
  }

  /**
   * Opens the restore confirmation.
   *
   * A restored learner goes back to the section they were in; the dialog only
   * asks about the ones whose former section is no longer an active section of
   * this grade, because for those there is nothing to go back to.
   */
  function openRestore(target) {
    setRestoreError(null);
    setRestoreRecord(asList(target));
  }

  /**
   * Restores every selected learner into one section.
   *
   * Each is its own request, because each is its own school record. A failure
   * part way through reports what already happened rather than swallowing it —
   * the roster really has changed by then.
   */
  async function handleRestore(fallbackSectionId) {
    const chosen = restoreRecord ?? [];
    if (chosen.length === 0) return;

    setRestoring(true);
    setRestoreError(null);
    setPageError(null);
    setDropNotice(null);

    let restored = 0;
    for (const learner of chosen) {
      // Back where they were. The chosen section is only for the learners
      // whose former one is no longer somewhere they can be placed.
      const destination = returnsToFormerSection(learner, gradeSections)
        ? learner.section_id
        : fallbackSectionId;
      if (!destination) {
        setRestoreError("Choose a section for the learners who cannot go back.");
        setRestoring(false);
        return;
      }

      const result = await restoreStudent(learner.student_id, destination);
      if (!result.ok) {
        setRestoreError(
          restored > 0
            ? `${result.error ?? "Could not restore this student."} ${restored} of ` +
              `${chosen.length} were restored before this failed.`
            : (result.error ?? "Could not restore this student."),
        );
        setRestoring(false);
        if (restored > 0) await fetchRoster();
        return;
      }
      restored += 1;
    }

    await fetchRoster();
    setRestoring(false);
    setRestoreRecord(null);
    setDropNotice(
      restored === 1
        ? `${learnerName(chosen[0])} is back on the roster.`
        : `${restored} students are back on the roster.`,
    );
  }

  /**
   * Opens the purge confirmation, and reads what it would remove.
   *
   * The counts are fetched before the teacher can act, so the warning names
   * real figures rather than describing the categories in the abstract. For a
   * selection they are summed, which is the number that matters there.
   */
  async function openPurge(target) {
    const chosen = asList(target);
    setPurgeError(null);
    setPreviewError(null);
    setPurgePreview(null);
    setPurgeRecord(chosen);
    setLoadingPreview(true);

    const previews = await Promise.all(
      chosen.map((learner) => previewPurge(learner.student_id)),
    );
    setLoadingPreview(false);

    // A preview that failed is said out loud. Showing a purge dialog with no
    // counts in it would invite a teacher to confirm a deletion whose size
    // nobody could tell them — and the reason it failed is usually the same
    // reason the purge itself is about to.
    const refused = previews.find((preview) => !preview.ok);
    if (refused) {
      setPreviewError(
        `${refused.error ?? "The records to be removed could not be counted."} ` +
          "Nothing has been deleted.",
      );
      return;
    }

    const removes = {};
    for (const preview of previews) {
      for (const [table, count] of Object.entries(preview.data?.removes ?? {})) {
        removes[table] = (removes[table] ?? 0) + (Number(count) || 0);
      }
    }
    setPurgePreview({ removes });
  }

  /**
   * Permanently removes every selected learner.
   *
   * One request each, and each still carries that learner's own id for the
   * server to check against the record it reads: the confirmation typed into
   * the dialog gates the act, it does not stand in for the per-learner check.
   *
   * On failure the dialog stays open. Every purge is recorded server-side
   * before its first deletion, so pressing the button again resumes the ones
   * that did not finish rather than starting them over.
   */
  async function handlePurge({ acknowledged }) {
    const chosen = purgeRecord ?? [];
    if (chosen.length === 0) return;

    setPurging(true);
    setPurgeError(null);
    setPageError(null);
    setDropNotice(null);

    let purged = 0;
    for (const learner of chosen) {
      const result = await purgeStudent(learner.student_id, {
        learnerId: learner.learner_id,
        acknowledged,
      });
      if (!result.ok) {
        setPurgeError(
          purged > 0
            ? `${result.error ?? "Could not purge this student."} ${purged} of ` +
              `${chosen.length} were removed before this failed.`
            : (result.error ?? "Could not purge this student."),
        );
        setPurging(false);
        if (purged > 0) await fetchRoster();
        return;
      }
      purged += 1;
    }

    await fetchRoster();
    setPurging(false);
    setPurgeRecord(null);
    setPurgePreview(null);
    setDropNotice(
      purged === 1
        ? `${learnerName(chosen[0])} was permanently removed.`
        : `${purged} students were permanently removed.`,
    );
  }

  function confirmOne(learner) {
    setDropError(null);
    setConfirm({
      summary: `Drop ${learnerName(learner)}?`,
      count: 1,
      requests: [{ user_ids: [learner.user_id] }],
    });
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

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
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
                onChange={(event) => handleSearchChange(event.target.value)}
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

          <div>
            <label
              className="mb-1 block text-xs font-bold uppercase tracking-wider text-foreground"
              htmlFor="students-status-filter"
            >
              Student status
            </label>
            {/*
              * Sent to the API rather than applied to the loaded page: the
              * roster reads one page of a larger list, so a filter applied here
              * would report whatever the first hundred happened to contain.
              */}
            <select
              id="students-status-filter"
              className={FILTER_STYLE}
              value={statusFilter}
              onChange={(event) => handleStatusChange(event.target.value)}
              disabled={filtering}
              aria-label="Filter by student status"
            >
              {ROSTER_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
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

        {dropNotice ? (
          <p role="status" className="text-xs text-muted-foreground">
            {dropNotice}
          </p>
        ) : null}
      </div>

      {visibleLearners.length === 0 ? (
        <EmptyState
          message={
            learners.length === 0
              ? EMPTY_MESSAGE[statusFilter]
              : "No learners match that search or those filters."
          }
        />
      ) : (
        <div className="relative overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Enrolled students, grouped by class section
              </caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th
                    scope="col"
                    className={`${headPadding} w-0 border-l-4 border-transparent pr-0 font-semibold`}
                  >
                    <span className="sr-only">Select</span>
                  </th>
                  <th scope="col" className={`${headPadding} font-semibold`}>
                    Student
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

              {groups.map((group) => {
                const shown = group.learners.filter(matchesSearch);
                if (shown.length === 0) return null;

                const key = sectionKey(group.sectionId);
                const loaded = droppableLoaded(group);
                const selectable = selectableLoaded(group);
                const droppedHere = group.learners.length - loaded.length;
                const enrolled = Math.max(
                  enrolledIn(effectiveCounts, group.sectionId),
                  loaded.length,
                );
                const sectionChecked = isSectionSelected(selection, group.sectionId);
                const pickedHere = selectable.filter((learner) =>
                  selection.users.has(learner.user_id),
                ).length;

                return (
                  <tbody key={key || "unassigned"} className="divide-y divide-border">
                    {/*
                     * The section header is a row of the same table, so every
                     * column stays aligned and the grouping is structure rather
                     * than five tables stacked to look like one. It is a `th`
                     * scoped to the group, so a screen reader announces the
                     * class a learner belongs to instead of reading the names
                     * as one undifferentiated list.
                     *
                     * The rule down its left edge is what separates a heading
                     * from a learner without relying on the fill: the student
                     * rows below carry the same rule in `transparent`, so the
                     * two stay aligned and only one of them is drawn.
                     */}
                    <tr className="border-t-2 border-border bg-secondary">
                      <td
                        className={`${rowPadding} border-l-4 pr-0 align-middle ${
                          group.sectionId ? "border-primary" : "border-muted-foreground/40"
                        }`}
                      >
                        <SelectBox
                          checked={sectionChecked || (selectable.length > 0 && pickedHere === selectable.length)}
                          indeterminate={
                            !sectionChecked && pickedHere > 0 && pickedHere < selectable.length
                          }
                          disabled={selectable.length === 0}
                          onChange={() =>
                            setSelection(
                              sectionWideDropAvailable
                                ? toggleSection(selection, group.sectionId, loaded)
                                : toggleSectionRows(selection, selectable),
                            )
                          }
                          aria-label={`Select every student in ${group.name}`}
                        />
                      </td>
                      <th
                        scope="colgroup"
                        colSpan={4}
                        className={`${rowPadding} text-left font-normal`}
                      >
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <Users aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Section
                          </span>
                          <span className="font-display text-sm font-semibold text-foreground">
                            {group.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {sectionCountLabel({
                              status: statusFilter,
                              enrolled,
                              dropped: droppedHere,
                              shown: shown.length,
                            })}
                          </span>
                        </span>
                      </th>
                    </tr>

                    {shown.map((learner) => {
                      const dropped = isDropped(learner);
                      const locked = rowLocked(selection, learner, {
                        loaded: loaded.length,
                        enrolled,
                      });

                      return (
                        <tr key={learner.student_id} className="bg-card hover:bg-background">
                          <td
                            className={`${rowPadding} border-l-4 border-transparent pr-0 align-middle`}
                          >
                            {/*
                             * Every row is selectable, including a dropped
                             * one: clearing a graduating cohort and restoring
                             * a class that was dropped by mistake are the same
                             * shape of job, and neither should be forty
                             * separate clicks.
                             */}
                            <SelectBox
                              checked={isLearnerSelected(selection, learner)}
                              disabled={locked}
                              title={
                                locked
                                  ? "This section is selected whole. Untick the section to choose learners one by one."
                                  : undefined
                              }
                              onChange={() =>
                                setSelection(toggleLearner(selection, learner, selectable))
                              }
                              aria-label={`Select ${learnerName(learner)}`}
                            />
                          </td>
                          <td className={rowPadding}>
                            {/*
                             * The name is the way into the learner's record: a
                             * link rather than a row click, so it is reachable
                             * by keyboard, announced as a link, and openable in
                             * a new tab like any other.
                             */}
                            <Link
                              href={`/teacher/students/${learner.student_id}`}
                              className="rounded-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                            >
                              {learnerName(learner)}
                            </Link>
                            <p className="font-mono text-[11px] text-muted-foreground">{learner.learner_id}</p>
                            {/*
                             * No status badge here. The Status column already
                             * says it, and saying it twice is what produced a
                             * row reading "Dropped" beside "Active".
                             */}
                            {/*
                             * The column hidden on a narrow screen, said once
                             * here instead, so nothing is lost and nothing
                             * scrolls.
                             */}
                            <p className="text-[11px] text-muted-foreground sm:hidden">
                              {diagnosticStatus(learner.diagnostic_status).label}
                            </p>
                          </td>
                          {/*
                           * Neither the grade nor the section is a column any
                           * more. Every learner on this page is in the one
                           * grade MathSmart teaches, and the section is the
                           * heading they already sit under.
                           */}
                          <td className={`${rowPadding} hidden sm:table-cell`}>
                            <StatusPill status={diagnosticStatus(learner.diagnostic_status)} />
                          </td>
                          <td className={rowPadding}>
                            {/*
                             * One status, decided in one place. Access outranks
                             * monitoring, so a dropped learner reads "Dropped"
                             * rather than reporting how they were being
                             * monitored when they left.
                             */}
                            <StatusPill status={learnerStatus(learner)} />
                          </td>
                          <td className={`${rowPadding} text-right`}>
                            <StudentRowActions
                              learner={learner}
                              disabled={anySelected}
                              onEdit={() => {
                                setFormError(null);
                                setEditRecord(learner);
                              }}
                              onDrop={() => confirmOne(learner)}
                              onRestore={() => openRestore(learner)}
                              onPurge={() => openPurge(learner)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
        </div>
      )}

      {/*
       * The selection bar appears only once something is selected, and is
       * pinned to the bottom of the viewport: a teacher ticking their way down
       * a long section should not have to scroll back up to act on it.
       */}
      {anySelected ? (
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-card px-4 py-3 sm:mx-0 sm:rounded-lg sm:border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm font-medium text-foreground">
              {selectedCount} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelection(emptySelection())}
              >
                Clear
              </Button>

              {/*
                * The actions offered are the ones true of everything selected.
                * A mixture of enrolled and dropped learners offers neither,
                * rather than an action that would half apply.
                */}
              {selectionIsEnrolled ? (
                <Button type="button" size="sm" variant="destructive" onClick={confirmSelection}>
                  <UserMinus aria-hidden="true" className="size-4" />
                  Drop selected
                </Button>
              ) : null}

              {selectionIsDropped ? (
                <>
                  <Button type="button" size="sm" onClick={() => openRestore(selectedLearners)}>
                    <RotateCcw aria-hidden="true" className="size-4" />
                    Restore selected
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => openPurge(selectedLearners)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Purge selected
                  </Button>
                </>
              ) : null}

              {!selectionIsEnrolled && !selectionIsDropped ? (
                <p className="text-xs text-muted-foreground">
                  Enrolled and dropped learners are selected together, so there is no action
                  that applies to all of them.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

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
        onDrop={() => confirmOne(editRecord)}
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

      <RestoreStudentDialog
        students={restoreRecord}
        sections={gradeSections}
        open={Boolean(restoreRecord)}
        onOpenChange={(next) => {
          if (!next) setRestoreRecord(null);
        }}
        onConfirm={handleRestore}
        busy={restoring}
        error={restoreError}
      />

      <PurgeStudentDialog
        students={purgeRecord}
        preview={purgePreview}
        loadingPreview={loadingPreview}
        previewError={previewError}
        open={Boolean(purgeRecord)}
        onOpenChange={(next) => {
          if (!next) {
            setPurgeRecord(null);
            setPurgePreview(null);
            setPreviewError(null);
          }
        }}
        onConfirm={handlePurge}
        busy={purging}
        error={purgeError}
      />

      <DropStudentDialog
        summary={confirm?.summary}
        count={confirm?.count ?? 0}
        open={Boolean(confirm)}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
        onConfirm={handleDrop}
        busy={dropping}
        error={dropError}
      />
    </div>
  );
}
