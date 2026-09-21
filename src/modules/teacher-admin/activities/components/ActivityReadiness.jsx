"use client";

import { ListChecks, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * "Not ready", beside the publication badge rather than instead of it.
 *
 * Published and ready are two different facts and a teacher needs both. The
 * status badge answers "did I publish this", which is still true and is why
 * learners are being offered it at all; this one answers "would it start", and
 * replacing the first with the second would hide the reason the row is urgent.
 *
 * A word and a shape, so the difference survives a colour-blind reader, a
 * greyscale print of the workspace, and a projector that flattens the palette.
 */
export function ActivityReadinessBadge({ className }) {
  return (
    <Badge variant="destructive" className={className}>
      <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
      <span>Not ready</span>
    </Badge>
  );
}

/**
 * What is missing, and the control that fixes it.
 *
 * Not a live region. A page carries up to twenty of these, and announcing them
 * would read the whole grid aloud every time the list refreshes; the badge
 * beside the title is what makes the row findable, and this is what a teacher
 * reads once they have found it.
 *
 * @param {object} props
 * @param {string} props.headline - The missing dependency, named
 * @param {string} props.detail - What it costs a learner, and what to do instead
 * @param {string} props.title - The activity's title, for the action's label
 * @param {() => void} [props.onFix] - Opens the question-membership editor
 */
export function ActivityReadinessNote({ headline, detail, title, onFix }) {
  return (
    <div className="flex flex-col gap-2 border-l-[3px] border-destructive bg-destructive/5 px-3 py-2.5">
      <p className="text-xs leading-relaxed text-foreground">
        <span className="font-semibold">{headline}.</span> {detail}
      </p>

      {onFix ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 self-start"
          onClick={onFix}
        >
          <ListChecks className="size-3.5" aria-hidden="true" />
          Choose its questions
          <span className="sr-only"> in {title}</span>
        </Button>
      ) : null}
    </div>
  );
}
