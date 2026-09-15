"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { MONITORING_STATUS } from "../utils/labels";

function FieldLabel({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-bold uppercase tracking-wider text-foreground">
      {children}
    </label>
  );
}

const SELECT_STYLE =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * The edit form body. Keyed by the student it edits, so React remounts it each
 * time the dialog opens for a different learner and state starts fresh.
 */
function EditStudentFields({ student, grades, sections, onCancel, onSubmit, busy, error }) {
  const [gradeId, setGradeId] = useState(student?.grade_id ?? grades[0]?.grade_id ?? "");
  const originalSectionId = student?.section_id ?? "";
  const [sectionId, setSectionId] = useState(
    sections.some((section) => section.section_id === originalSectionId) ? originalSectionId : ""
  );
  const [monitoring, setMonitoring] = useState(student?.monitoring_status ?? "active");

  const originalGradeId = student?.grade_id ?? "";
  const gradeChanged = gradeId !== originalGradeId;
  const sectionsForGrade = sections.filter((section) => section.grade_id === gradeId);

  function handleGradeChange(nextGradeId) {
    setGradeId(nextGradeId);
    if (nextGradeId === originalGradeId) {
      setSectionId(sections.some((section) => section.section_id === originalSectionId) ? originalSectionId : "");
      return;
    }
    setSectionId(sectionsForGrade[0]?.section_id ?? "");
  }

  function handleSubmit(event) {
    event.preventDefault();

    const payload = {
      grade_id: gradeId,
      monitoring_status: monitoring,
    };
    if (sectionId) payload.section_id = sectionId;

    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle className="font-display text-lg font-semibold">
          Edit {student?.full_name ?? "student"}
        </DialogTitle>
        <DialogDescription>
          Move the learner to another grade or section, or update their monitoring status.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="edit-student-grade">Grade Level</FieldLabel>
            <select
              id="edit-student-grade"
              className={SELECT_STYLE}
              value={gradeId}
              onChange={(event) => handleGradeChange(event.target.value)}
              required
            >
              {grades.map((grade) => (
                <option key={grade.grade_id} value={grade.grade_id}>
                  {grade.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel htmlFor="edit-student-section">Section</FieldLabel>
            <select
              id="edit-student-section"
              className={SELECT_STYLE}
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
            >
              {sectionsForGrade.length === 0 ? (
                <option value="">No sections in this grade</option>
              ) : (
                <>
                  <option value="">No section assigned</option>
                  {sectionsForGrade.map((section) => (
                    <option key={section.section_id} value={section.section_id}>
                      {section.name}
                    </option>
                  ))}
                </>
              )}
            </select>
            {gradeChanged && sectionsForGrade.length > 0 && !sectionId ? (
              <p className="mt-1 text-xs text-muted-foreground">Pick a section in this grade to move them into it.</p>
            ) : null}
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="edit-student-monitoring">Monitoring status</FieldLabel>
          <select
            id="edit-student-monitoring"
            className={SELECT_STYLE}
            value={monitoring}
            onChange={(event) => setMonitoring(event.target.value)}
            required
          >
            {Object.entries(MONITORING_STATUS).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save Changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Edit a learner's enrolment. `student` is the record being edited, or `null`
 * when the dialog is closed. Grades and sections supply the dropdowns; the
 * section list follows the chosen grade.
 */
export function EditStudentDialog({ student, grades, sections, open, onOpenChange, onSubmit, busy, error }) {
  const hasGrades = grades && grades.length > 0;
  const noGradesError = !hasGrades && open ? "No grade levels exist, so this student cannot be placed." : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-xl">
        {noGradesError || !student ? (
          <div className="py-6">
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-semibold">Edit Student</DialogTitle>
            </DialogHeader>
            <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {noGradesError ?? "No student selected."}
            </p>
            <DialogFooter className="mt-4">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <EditStudentFields
            key={student.student_id}
            student={student}
            grades={grades}
            sections={sections}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            busy={busy}
            error={error}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}