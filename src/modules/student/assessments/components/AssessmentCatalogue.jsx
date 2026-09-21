import Link from "next/link";
import {
  ArrowRight,
  CircleCheck,
  CircleDot,
  ClipboardCheck,
  RotateCcw,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { AVAILABILITY } from "../utils/catalogue.js";

/**
 * The papers a learner can sit, as a list rather than a single fixed card.
 *
 * Each card says three things a learner needs before deciding: what it is,
 * how long it takes, and whether it is open to them right now. The last of
 * those is the server's answer, carried on the row, so the card cannot offer
 * something the start route is going to refuse.
 */

/** A glyph per state, so the status never rests on colour alone. */
const ICON_FOR_AVAILABILITY = Object.freeze({
  [AVAILABILITY.AVAILABLE]: ClipboardCheck,
  [AVAILABILITY.IN_PROGRESS]: CircleDot,
  [AVAILABILITY.REASSESSMENT]: RotateCcw,
  [AVAILABILITY.COMPLETED]: CircleCheck,
  // A spanner, the same picture the Activities list uses for the same
  // situation: someone is still working on this and it is not the learner.
  [AVAILABILITY.NOT_READY]: Wrench,
});

function AssessmentCard({ assessment }) {
  const Icon = ICON_FOR_AVAILABILITY[assessment.availability] ?? ClipboardCheck;

  const facts = [
    assessment.typeLabel,
    assessment.totalQuestions > 0
      ? `${assessment.totalQuestions} question${assessment.totalQuestions === 1 ? "" : "s"}`
      : null,
    assessment.durationMinutes > 0 ? `${assessment.durationMinutes} minutes` : null,
  ].filter(Boolean);

  return (
    <Card className="flex h-full flex-col gap-0 border-border bg-card py-0">
      <CardHeader className="gap-3 px-5 pt-5 pb-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon aria-hidden="true" className="size-5" />
          </div>
          {/* The word carries the meaning; the badge is only where it sits. */}
          <Badge variant="outline" className="shrink-0">
            {assessment.label}
          </Badge>
        </div>
        <CardTitle as="h3" className="text-base leading-snug">
          {assessment.title}
        </CardTitle>
        {assessment.description ? (
          <CardDescription className="line-clamp-3 leading-relaxed">
            {assessment.description}
          </CardDescription>
        ) : null}
      </CardHeader>

      <CardContent className="px-5 pt-3 pb-0">
        <p className="text-xs text-muted-foreground">{facts.join(" · ")}</p>
      </CardContent>

      <CardFooter className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 px-5 pt-3 pb-4">
        {assessment.href ? (
          <Button asChild size="sm" variant={assessment.canOpen ? "default" : "outline"}>
            <Link href={assessment.href}>
              {assessment.verb}
              <span className="sr-only"> {assessment.title}</span>
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        ) : assessment.reason ? (
          // Published, but the server says a start request would be refused.
          // The same treatment a locked activity gets: a control that is
          // plainly there and plainly not pressable, carrying `aria-disabled`
          // rather than `disabled` so a learner tabbing through still meets
          // it and hears why, with the reason spelled out beneath it.
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-disabled="true"
              className="cursor-not-allowed opacity-70"
            >
              <Wrench aria-hidden="true" />
              {assessment.verb}
              <span className="sr-only">: {assessment.title}</span>
            </Button>
            <p className="basis-full text-xs leading-relaxed text-muted-foreground">
              {assessment.reason}
            </p>
          </>
        ) : (
          // Finished, but the attempt it produced did not come back with the
          // row. There is nothing to open, and saying so is better than a
          // control that goes nowhere.
          <p className="text-xs text-muted-foreground">
            This paper is finished. Its report is not available right now.
          </p>
        )}
      </CardFooter>
    </Card>
  );
}

export function AssessmentCatalogue({ assessments }) {
  if (assessments.length === 0) {
    return (
      <div className="border border-border bg-card p-5">
        <p className="font-medium text-foreground">No assessments are set for you yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          When your teacher publishes one for Grade 6, it will appear here.
        </p>
      </div>
    );
  }

  return (
    // `role` restated on both. A `ul` laid out as a grid is no longer a list
    // to Chromium — the items stop being `display: list-item`, and the
    // accessible tree drops `list` and `listitem` with them, so a screen
    // reader announces two cards instead of "list, 2 items". Saying it
    // explicitly puts the semantics back without giving up the layout.
    <ul
      role="list"
      className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-3"
    >
      {assessments.map((assessment) => (
        <li key={assessment.id} role="listitem" className="h-full">
          <AssessmentCard assessment={assessment} />
        </li>
      ))}
    </ul>
  );
}
