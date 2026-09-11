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

const GRADE_LEVELS = Array.from({ length: 12 }, (_, index) => String(index + 1));

function FieldLabel({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-bold uppercase tracking-wider text-foreground">
      {children}
    </label>
  );
}

/**
 * The form body. It is keyed by the record it edits, so React remounts it each
 * time the dialog opens for a different grade and state starts fresh.
 */
function GradeFormFields({ record, onCancel, onSubmit, busy, error }) {
  const editing = Boolean(record);
  const [name, setName] = useState(record?.name ?? "");
  const [level, setLevel] = useState(String(record?.level ?? 6));
  const [isActive, setIsActive] = useState(record?.is_active !== false);

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      level: Number(level),
      is_active: isActive,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle className="font-display text-lg font-semibold">
          {editing ? "Edit Grade Level" : "Add Grade Level"}
        </DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the name, level, or availability of this grade."
            : "Add a new DepEd grade level to the school directory."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-4">
        <div>
          <FieldLabel htmlFor="grade-name">Grade Name</FieldLabel>
          <Input
            id="grade-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Grade 6"
            required
            minLength={2}
            maxLength={60}
          />
        </div>

        <div>
          <FieldLabel htmlFor="grade-level">Level</FieldLabel>
          <select
            id="grade-level"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            required
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {GRADE_LEVELS.map((levelNumber) => (
              <option key={levelNumber} value={levelNumber}>
                {levelNumber}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="size-4 accent-primary"
          />
          Active grade level
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
          {busy ? "Saving…" : editing ? "Save Grade" : "Add Grade"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Create or edit a grade level.
 *
 * `grade` is the record being edited, or `null` when the dialog creates one.
 * Archiving is done from the row, not from the dialog, so this stays focused.
 */
export function GradeFormDialog({ grade, open, onOpenChange, onSubmit, busy, error }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-xl">
        <GradeFormFields
          key={grade?.grade_id ?? `new-${open}`}
          record={grade}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
          busy={busy}
          error={error}
        />
      </DialogContent>
    </Dialog>
  );
}