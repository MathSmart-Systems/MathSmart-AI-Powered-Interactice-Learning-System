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
import { Input } from "@/components/ui/input";

import { MVP_GRADE_LEVEL, nameContradictsLevel } from "../utils/grade-scope";

function FieldLabel({ htmlFor, children }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-xs font-bold tracking-wider text-foreground uppercase"
    >
      {children}
    </label>
  );
}

/**
 * The form body. It is keyed by the record it edits, so React remounts it each
 * time the dialog opens and state starts fresh.
 *
 * The level is not a field. MathSmart teaches one grade, so the only thing
 * there is to change about the grade record is what it is called — and even
 * that cannot name a different grade, which is the contradiction this guards.
 */
function GradeFormFields({ record, onCancel, onSubmit, busy, error }) {
  const [name, setName] = useState(record?.name ?? "");
  const [isActive, setIsActive] = useState(record?.is_active !== false);
  const [nameProblem, setNameProblem] = useState(null);

  const trimmed = name.trim();
  const contradicts = nameContradictsLevel(trimmed, MVP_GRADE_LEVEL);

  function handleSubmit(event) {
    event.preventDefault();

    if (contradicts) {
      setNameProblem(
        `This is the Grade ${MVP_GRADE_LEVEL} record, so its name cannot name a different grade.`,
      );
      return;
    }

    setNameProblem(null);
    onSubmit({ name: trimmed, level: MVP_GRADE_LEVEL, is_active: isActive });
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle className="font-display text-lg font-semibold">Edit Grade Level</DialogTitle>
        <DialogDescription>
          MathSmart teaches the DepEd Grade {MVP_GRADE_LEVEL} curriculum, so the level is fixed. You
          can change what this grade is called.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
        <div>
          <FieldLabel htmlFor="grade-name">Grade Name</FieldLabel>
          <Input
            id="grade-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameProblem(null);
            }}
            placeholder={`e.g. Grade ${MVP_GRADE_LEVEL}`}
            required
            minLength={2}
            maxLength={60}
            aria-invalid={Boolean(nameProblem) || undefined}
            aria-describedby={nameProblem ? "grade-name-problem" : undefined}
          />
          {nameProblem ? (
            <p id="grade-name-problem" role="alert" className="mt-1 text-xs text-destructive">
              {nameProblem}
            </p>
          ) : null}
        </div>

        <div>
          <FieldLabel htmlFor="grade-level">Level</FieldLabel>
          <p
            id="grade-level"
            className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground"
          >
            {MVP_GRADE_LEVEL} — the only level MathSmart supports
          </p>
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
      
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save Grade"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Edit the one grade level.
 *
 * There is no create mode: MathSmart has a single grade, seeded with the
 * database, and the API refuses a second one.
 */
export function GradeFormDialog({ grade, open, onOpenChange, onSubmit, busy, error }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-xl">
        <GradeFormFields
          key={grade?.grade_id ?? "grade"}
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
