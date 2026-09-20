"use client";

import { UserMinus } from "lucide-react";

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

/**
 * The confirmation before learners are dropped from the school.
 *
 * One learner or a whole section reaches the same dialog, because it is the
 * same act at different sizes and a teacher clearing a cohort at the end of
 * the year deserves the same sentence as one correcting a single enrolment.
 *
 * Dropping archives: the learners lose access and leave the roster, and their
 * recorded work stays exactly where it is. That is not a compromise but the
 * only correct outcome here — seven tables reference a learner's attempts,
 * results and interventions, every one of those foreign keys refuses a delete,
 * and the class reporting a teacher relies on is built from them.
 *
 * So this dialog says what actually happens rather than implying an erasure it
 * cannot perform, and it reads back the number it is about to act on.
 */
export function DropStudentDialog({ summary, count = 0, open, onOpenChange, onConfirm, busy, error }) {
  const plural = count === 1 ? "student" : "students";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>{summary ?? `Drop ${count} ${plural}?`}</DialogTitle>
          <DialogDescription>
            They lose access to MathSmart straight away and leave the roster.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-foreground">
            Their scores, attempts and interventions are kept. Class reports covering the time
            they were enrolled stay accurate, and a dropped learner can be restored later.
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Keep them enrolled
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={busy}>
            <UserMinus aria-hidden="true" className="size-4" />
            {busy ? "Dropping…" : `Drop ${count} ${plural}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
