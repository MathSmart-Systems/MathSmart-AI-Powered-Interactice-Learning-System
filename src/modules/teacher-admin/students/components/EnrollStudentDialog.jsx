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
 * The enrollment form body. Keyed by the dialog's open state so React remounts
 * it and state starts fresh each time the dialog opens.
 */
function EnrollStudentFields({ grade, sections, onCancel, onSubmit, busy, error }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [learnerId, setLearnerId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [schoolName, setSchoolName] = useState("");

  // MathSmart teaches one grade, so there is no grade to choose. The section
  // list is the sections of that grade which are still active; a retired one
  // is not somewhere a learner can be put, and the API refuses it.
  const availableSections = assignableSections(sections, grade);

  function handleSubmit(event) {
    event.preventDefault();

    const payload = {
      full_name: fullName.trim(),
      email: email.trim(),
      learner_id: learnerId.trim(),
      // Resolved from the directory, never asked for. The API checks it is the
      // supported grade, so a crafted request cannot enroll anyone elsewhere.
      grade_id: grade.grade_id,
    };
    if (sectionId) payload.section_id = sectionId;
    if (schoolName.trim()) payload.school_name = schoolName.trim();

    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle className="font-display text-lg font-semibold">Enroll Student</DialogTitle>
        <DialogDescription>
          Create an account for the learner and place them in a grade and section.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
        <div>
          <FieldLabel htmlFor="student-full-name">Full Name</FieldLabel>
          <Input
            id="student-full-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="e.g. Gabriel Silang"
            autoComplete="name"
            required
            minLength={2}
            maxLength={120}
          />
        </div>

        <div>
          <FieldLabel htmlFor="student-email">Email</FieldLabel>
          <Input
            id="student-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="e.g. gabriel.silang@school.edu.ph"
            autoComplete="email"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">The learner signs in with this address.</p>
        </div>

        <div>
          <FieldLabel htmlFor="student-lrn">Learner ID / LRN</FieldLabel>
          <Input
            id="student-lrn"
            value={learnerId}
            onChange={(event) => setLearnerId(event.target.value)}
            placeholder="e.g. 136309123456"
            className="font-mono"
            required
            minLength={4}
            maxLength={32}
          />
        </div>

        <div>
          <div>
            <FieldLabel htmlFor="student-section">Section</FieldLabel>
            <select
              id="student-section"
              className={SELECT_STYLE}
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
            >
              <option value="">No section assigned</option>
              {availableSections.map((section) => (
                <option key={section.section_id} value={section.section_id}>
                  {section.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="student-school">School (optional)</FieldLabel>
          <Input
            id="student-school"
            value={schoolName}
            onChange={(event) => setSchoolName(event.target.value)}
            placeholder="e.g. DepEd Elementary School"
            maxLength={160}
          />
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
          {busy ? "Enrolling…" : "Save & Enroll"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Enroll a learner into the one grade MathSmart teaches.
 *
 * `grade` is that grade's record, resolved from the directory rather than
 * chosen: there is no grade field in the form, and the API refuses any other.
 * `sections` supplies the one placement choice there is, narrowed to the
 * active sections of that grade.
 */
export function EnrollStudentDialog({ grade, sections, open, onOpenChange, onSubmit, busy, error }) {
  const noGradesError = !grade && open
    ? `The ${MVP_GRADE_NAME} record is missing from this deployment, so a learner has nothing to be enrolled into. Restore it from the database seed first.`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-xl">
        {noGradesError ? (
          <div className="py-6">
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-semibold">Enroll Student</DialogTitle>
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
          <EnrollStudentFields
            key={`enroll-${open}`}
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