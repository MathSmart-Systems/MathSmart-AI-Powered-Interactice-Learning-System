"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";

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

import { learnerName } from "../utils/roster";

const SELECT_STYLE =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Whether a learner's former section is somewhere they can go back to.
 *
 * `sections` is already the active sections of the grade this roster teaches,
 * so membership answers both halves of the question at once: still active, and
 * still this grade.
 */
export function returnsToFormerSection(learner, sections) {
  const formerId = learner?.section_id ?? null;
  if (!formerId) return false;
  return (sections ?? []).some((section) => section.section_id === formerId);
}

/**
 * Putting dropped learners back on the roster.
 *
 * A restored learner goes back where they were. That is the answer almost
 * every time, so the dialog does not ask — it says which section each one is
 * returning to and gets out of the way.
 *
 * It asks only when it genuinely cannot know: a learner whose former section
 * has since been retired, or moved to another grade, has nowhere to return to,
 * and guessing on their behalf would put them in a class they were never in.
 * Those learners are named, and one destination is chosen for them.
 *
 * It also says plainly what restore does not do. Nothing recorded about the
 * learner is recalculated or replayed; their history is simply still there.
 */
function RestoreFields({ students, sections, onCancel, onConfirm, busy, error }) {
  const only = students.length === 1 ? students[0] : null;
  const name = only ? learnerName(only) : `${students.length} students`;

  const returning = students.filter((learner) => returnsToFormerSection(learner, sections));
  const needPlacement = students.filter(
    (learner) => !returnsToFormerSection(learner, sections),
  );

  // Only ever used for the learners who cannot go back, so it starts empty
  // rather than defaulting to somebody else's class.
  const [fallbackId, setFallbackId] = useState("");
  const fallback = sections.find((section) => section.section_id === fallbackId) ?? null;
  const ready = needPlacement.length === 0 || Boolean(fallbackId);

  function sectionNameOf(learner) {
    const id = learner?.section_id ?? null;
    return sections.find((section) => section.section_id === id)?.name ?? null;
  }

  function submit(event) {
    event.preventDefault();
    if (!ready) return;
    onConfirm(fallbackId || null);
  }

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle>Restore {name}?</DialogTitle>
        <DialogDescription>
          {needPlacement.length === 0
            ? "They go back to the section they were in and can sign in again."
            : "They can sign in again and return to the roster."}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
        {only && returning.length === 1 ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Learner ID</dt>
            <dd className="font-mono text-xs text-foreground">{only.learner_id}</dd>

            <dt className="text-muted-foreground">Returning to</dt>
            <dd className="font-medium text-foreground">{sectionNameOf(only)}</dd>
          </dl>
        ) : null}

        {!only && returning.length > 0 ? (
          <div className="text-sm">
            <p className="text-muted-foreground">
              {returning.length === 1
                ? "One learner goes back to their own section:"
                : `${returning.length} go back to their own sections:`}
            </p>
            <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto text-foreground">
              {returning.map((learner) => (
                <li key={learner.student_id}>
                  {learnerName(learner)} → {sectionNameOf(learner)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {needPlacement.length > 0 ? (
          <div>
            <p className="text-sm text-foreground">
              {needPlacement.length === 1
                ? `${learnerName(needPlacement[0])} cannot go back: their former section is no longer an active section of this grade.`
                : `${needPlacement.length} learners cannot go back: their former section is no longer an active section of this grade.`}
            </p>
            {!only ? (
              <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-sm text-muted-foreground">
                {needPlacement.map((learner) => (
                  <li key={learner.student_id}>
                    {learnerName(learner)}
                    {learner.section_name ? ` — was in ${learner.section_name}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}

            <label
              className="mb-1 mt-3 block text-xs font-bold uppercase tracking-wider text-foreground"
              htmlFor="restore-section"
            >
              Place them in
            </label>
            <select
              id="restore-section"
              className={SELECT_STYLE}
              value={fallbackId}
              onChange={(event) => setFallbackId(event.target.value)}
              required
            >
              <option value="">Choose a section…</option>
              {sections.map((section) => (
                <option key={section.section_id} value={section.section_id}>
                  {section.name}
                </option>
              ))}
            </select>
            {fallback ? (
              <p className="mt-1.5 text-xs text-muted-foreground">They join {fallback.name}.</p>
            ) : null}
          </div>
        ) : null}

        <p className="text-sm leading-relaxed text-foreground">
          Their scores, attempts, competency progress, learning path and interventions are
          already intact and are not changed by this. Nothing is recalculated.
        </p>

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
        <Button type="submit" disabled={busy || !ready}>
          <RotateCcw aria-hidden="true" className="size-4" />
          {busy ? "Restoring…" : only ? "Restore student" : `Restore ${students.length} students`}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RestoreStudentDialog({
  students,
  sections,
  open,
  onOpenChange,
  onConfirm,
  busy,
  error,
}) {
  const chosen = students ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-xl">
        {chosen.length > 0 ? (
          <RestoreFields
            key={chosen.map((learner) => learner.student_id).join(",")}
            students={chosen}
            sections={sections}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
            busy={busy}
            error={error}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
