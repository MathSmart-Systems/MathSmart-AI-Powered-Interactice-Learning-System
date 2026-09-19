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

import { MVP_GRADE_NAME } from "../utils/grade-scope";

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
 * The form body. It is keyed by the section it edits, so React remounts it each
 * time the dialog opens for a different section and state starts fresh.
 *
 * The grade is not a field and is not shown. Every section in MathSmart
 * belongs to the one grade the product teaches, so it is filled in from the
 * directory rather than asked for. The dialog's own description says which
 * grade that is, which is the only place it needs saying.
 */
function SectionFormFields({ record, grade, advisers, onCancel, onSubmit, busy, error }) {
  const editing = Boolean(record);
  const [name, setName] = useState(record?.name ?? "");
  const [adviserId, setAdviserId] = useState(record?.adviser_id ?? "");
  const [isActive, setIsActive] = useState(record?.is_active !== false);

  const adviserOptions = Object.entries(advisers ?? {});
  // An adviser who has since left the directory is not a choice any more. The
  // select shows the current value so it is not silently dropped on save.
  const adviserMissing = Boolean(adviserId) && !adviserOptions.some(([id]) => id === adviserId);

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      adviser_id: adviserId,
      is_active: isActive,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle className="font-display text-lg font-semibold">
          {editing ? "Edit Section" : "Add Section"}
        </DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the name, adviser, or availability of this section."
            : `Create a new class section. It joins ${grade.name} automatically.`}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
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
          <FieldLabel htmlFor="section-adviser">Adviser</FieldLabel>
          <select
            id="section-adviser"
            value={adviserId}
            onChange={(event) => setAdviserId(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">No adviser assigned</option>
            {adviserMissing ? (
              <option value={adviserId}>The assigned adviser is no longer available</option>
            ) : null}
            {adviserOptions.map(([id, adviserName]) => (
              <option key={id} value={id}>
                {adviserName}
              </option>
            ))}
          </select>
          {adviserMissing ? (
            <p className="mt-1 text-xs text-destructive">
              That adviser has left the directory. Choose another, or leave the section unassigned.
            </p>
          ) : null}
          {adviserOptions.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              No active Teacher/Administrator accounts available. You can assign an adviser later.
            </p>
          ) : null}
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
          {busy ? "Saving…" : editing ? "Save Section" : "Add Section"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Create or edit a class section under the one grade MathSmart teaches.
 *
 * `section` is the record being edited, or `null` when the dialog creates one.
 * `grade` is the Grade 6 record every section belongs to; without it there is
 * nothing to create a section inside, and the dialog says so instead of
 * offering a form that cannot be saved.
 */
export function SectionFormDialog({
  section,
  grade,
  advisers,
  open,
  onOpenChange,
  onSubmit,
  busy,
  error,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-xl">
        {grade ? (
          <SectionFormFields
            key={section?.section_id ?? `new-${open}`}
            record={section}
            grade={grade}
            advisers={advisers}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            busy={busy}
            error={error}
          />
        ) : (
          <div className="py-6">
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-semibold">
                {section ? "Edit Section" : "Add Section"}
              </DialogTitle>
            </DialogHeader>
            <p
              role="alert"
              className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              The {MVP_GRADE_NAME} record is missing from the directory, so there is no grade to put
              a section in. Restore it from the database seed first.
            </p>
            <DialogFooter className="mt-4">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
