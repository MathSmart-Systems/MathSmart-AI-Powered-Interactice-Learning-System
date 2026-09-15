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
import { Input } from "@/components/ui/input";

function FieldLabel({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-bold uppercase tracking-wider text-foreground">
      {children}
    </label>
  );
}

/**
 * The form body. It is keyed by the section it edits, so React remounts it each
 * time the dialog opens for a different section and state starts fresh.
 */
function SectionFormFields({
  record,
  grades,
  advisers,
  onCancel,
  onSubmit,
  busy,
  error,
}) {
  const editing = Boolean(record);
  const [name, setName] = useState(record?.name ?? "");
  const [gradeId, setGradeId] = useState(record?.grade_id ?? grades[0]?.grade_id ?? "");
  const [adviserId, setAdviserId] = useState(record?.adviser_id ?? "");
  const [isActive, setIsActive] = useState(record?.is_active !== false);

  function handleSubmit(event) {
    event.preventDefault();
    
    // Validate adviser_id if one was selected
    if (adviserId && adviserId.trim()) {
      const adviserExists = adviserOptions.some(([id]) => id === adviserId);
      if (!adviserExists) {
        // This shouldn't happen normally, but protects against stale data
        alert("The selected adviser is no longer available. Please choose another or leave unassigned.");
        return;
      }
    }
    
    const payload = {
      name: name.trim(),
      grade_id: gradeId,
      is_active: isActive,
    };
    if (adviserId && adviserId.trim()) {
      payload.adviser_id = adviserId;
    }
    onSubmit(payload);
  }

  const adviserOptions = Object.entries(advisers);

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle className="font-display text-lg font-semibold">
          {editing ? "Edit Section" : "Add Section"}
        </DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the name, grade, or adviser of this section."
            : "Create a new section inside a grade level."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-4">
        <div>
          <FieldLabel htmlFor="section-name">Section Name</FieldLabel>
          <Input
            id="section-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Rizal"
            required
            minLength={1}
            maxLength={60}
          />
        </div>

        <div>
          <FieldLabel htmlFor="section-grade">Grade Level</FieldLabel>
          <select
            id="section-grade"
            value={gradeId}
            onChange={(event) => setGradeId(event.target.value)}
            required
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {grades.map((grade) => (
              <option key={grade.grade_id} value={grade.grade_id}>
                {grade.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel htmlFor="section-adviser">Adviser</FieldLabel>
          <select
            id="section-adviser"
            value={adviserId}
            onChange={(event) => setAdviserId(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">No adviser assigned</option>
            {adviserOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          {adviserOptions.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              No active teacher/admin accounts available. You can assign an adviser later.
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="size-4 accent-primary"
          />
          Active section
        </label>
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
          {busy ? "Saving…" : editing ? "Save Section" : "Add Section"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Create or edit a class section.
 *
 * `section` is the record being edited, or `null` when the dialog creates one.
 * `grades` and `advisers` supply the dropdown options; advisers maps teacher
 * user ids to display names from the Teacher/Administrator directory.
 */
export function SectionFormDialog({
  section,
  grades,
  advisers,
  open,
  onOpenChange,
  onSubmit,
  busy,
  error,
}) {
  // Validate that grades exist before allowing section creation
  const hasGrades = grades && grades.length > 0;
  const noGradesError = !hasGrades && open ? "Please create at least one grade level before adding sections." : null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-xl">
        {noGradesError ? (
          <div className="py-6">
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-semibold">
                {section ? "Edit Section" : "Add Section"}
              </DialogTitle>
            </DialogHeader>
            <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {noGradesError}
            </p>
            <DialogFooter className="mt-4">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <SectionFormFields
            key={section?.section_id ?? `new-${open}`}
            record={section}
            grades={grades}
            advisers={advisers}
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