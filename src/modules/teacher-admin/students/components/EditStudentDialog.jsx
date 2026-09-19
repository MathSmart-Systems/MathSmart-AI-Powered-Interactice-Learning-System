"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { MONITORING_STATUS } from "../utils/labels";
import { MVP_GRADE_NAME, assignableSections } from "../utils/roster";

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
function EditStudentFields({ student, grade, sections, onCancel, onSubmit, busy, error }) {
  const originalSectionId = student?.section_id ?? "";

  // MathSmart teaches one grade, so a learner is never moved between grades.
  // The only placement decision left is which of its active sections they are
  // in, or none.
  const availableSections = assignableSections(sections, grade);
  const [sectionId, setSectionId] = useState(
    availableSections.some((section) => section.section_id === originalSectionId)
      ? originalSectionId
      : "",
  );
  const [monitoring, setMonitoring] = useState(student?.monitoring_status ?? "active");

  function handleSubmit(event) {
    event.preventDefault();

    const payload = {
      // The grade is never changed here; there is only one, and the learner is
      // already in it. Sending it would be asking the API to re-confirm a fact.
      monitoring_status: monitoring,
    };
    if (sectionId) payload.section_id = sectionId;

    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle className="font-display text-lg font-semibold">
          Edit {student?.full_name ?? "student"}
        </DialogTitle>
        <DialogDescription>
          Move the learner to another grade or section, or update their monitoring status.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
        <div>
          <FieldLabel htmlFor="edit-student-section">Section</FieldLabel>
          <select
            id="edit-student-section"
            className={SELECT_STYLE}
            value={sectionId}
            onChange={(event) => setSectionId(event.target.value)}
          >
            {availableSections.length === 0 ? (
              <option value="">No active sections yet</option>
            ) : (
              <>
                <option value="">No section assigned</option>
                {availableSections.map((section) => (
                  <option key={section.section_id} value={section.section_id}>
                    {section.name}
                  </option>
                ))}
              </>
            )}
          </select>
          {availableSections.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Add a {MVP_GRADE_NAME} section in Class Sections before placing a learner in one.
            </p>
          ) : null}
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
      
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </DialogBody>

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
 * Edit a learner's enrollment. `student` is the record being edited, or `null`
 * when the dialog is closed. Grades and sections supply the dropdowns; the
 * section list follows the chosen grade.
 */
export function EditStudentDialog({ student, grade, sections, open, onOpenChange, onSubmit, busy, error }) {
  const hasGrades = Boolean(grade);
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
            grade={grade}
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