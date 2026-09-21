"use client";

import { useCallback, useId, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  CheckCircle2,
  Clock,
  Edit2,
  ListChecks,
  Plus,
  Shapes,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

import {
  formatDate,
  formatDuration,
  formatMasteryThreshold,
  formatPoints,
} from "../utils/format.js";
import { describeActivityReadiness } from "../utils/readiness.js";
import { ActivityReadinessBadge, ActivityReadinessNote } from "./ActivityReadiness.jsx";
import { ActivityStatusBadge } from "./ActivityStatusBadge.jsx";

/** How many placeholder cards the loading grid reserves. */
const SKELETON_CARDS = 6;

/**
 * Loading skeleton cards shown while fetching activities.
 *
 * @returns {JSX.Element}
 */
function ActivityListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
      <p role="status" className="sr-only">
        Loading activities
      </p>
      {Array.from({ length: SKELETON_CARDS }).map((_, index) => (
        <Card
          key={index}
          className="animate-pulse overflow-hidden border-border/70 shadow-xs motion-reduce:animate-none"
        >
          <CardHeader className="space-y-2 pb-3">
            <div className="flex w-full min-w-0 items-center justify-between gap-2">
              <div className="h-4 w-28 rounded-md bg-muted" />
              <div className="h-5 w-16 shrink-0 rounded-md bg-muted" />
            </div>
            <div className="h-6 w-3/4 rounded-md bg-muted" />
          </CardHeader>
          <CardContent className="space-y-3 pb-4">
            <div className="h-4 w-full rounded bg-muted/80" />
            <div className="h-4 w-5/6 rounded bg-muted/60" />
            <div className="h-16 w-full rounded-xl bg-muted/40" />
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="flex gap-2">
              <div className="h-8 w-20 rounded bg-muted" />
              <div className="h-8 w-24 rounded bg-muted" />
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

/**
 * Empty state shown when no activities match current filters or when none exist.
 *
 * @param {object} props
 * @param {boolean} props.hasSearchOrFilter - Whether search or filter criteria are currently active
 * @param {() => void} [props.onCreate] - Callback to trigger the creation of a new activity
 * @returns {JSX.Element}
 */
function ActivityListEmpty({ hasSearchOrFilter, onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card px-6 py-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Shapes className="size-7" aria-hidden="true" />
      </div>
      <h3 className="font-display text-lg font-bold text-foreground">
        {hasSearchOrFilter ? "No matching activities found" : "No practice activities yet"}
      </h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {hasSearchOrFilter
          ? "Try adjusting the search, the status, or the module filter to find what you need."
          : "Author practice activities to give learners formative drills after they study a module."}
      </p>
      {!hasSearchOrFilter && onCreate ? (
        <Button type="button" onClick={onCreate} className="mt-6 h-11 gap-2 px-5">
          <Plus className="size-4" aria-hidden="true" />
          Create the first activity
        </Button>
      ) : null}
    </div>
  );
}

/**
 * An activity's instructions, previewed rather than printed in full.
 *
 * A card in a three-column grid cannot carry eight lines of prose without
 * deciding the height of every card beside it. The first few lines are almost
 * always enough to recognise the activity, so the rest is behind a control
 * that says so — a real button with `aria-expanded`, not a hover tooltip or a
 * truncation a keyboard user cannot get past.
 *
 * Whether the text is long enough to need the control is measured by the
 * element, not guessed from a character count: a clamp that never clamps would
 * otherwise still show "Show more".
 */
function ActivityInstructions({ text }) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const bodyId = useId();

  // Measured on attach rather than on every render: the clamp is a layout
  // fact, and re-reading it while the text is expanded would report "not
  // clamped" and take the control away mid-read.
  const measure = useCallback((node) => {
    if (node) {
      setClamped(node.scrollHeight > node.clientHeight + 1);
    }
  }, []);

  if (!text) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        No instructions written for this activity yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p
        id={bodyId}
        ref={measure}
        className={
          expanded
            ? "text-xs leading-relaxed break-words text-muted-foreground"
            : "line-clamp-3 text-xs leading-relaxed break-words text-muted-foreground"
        }
      >
        {text}
      </p>

      {clamped || expanded ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((open) => !open)}
          className="self-start text-xs font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {expanded ? "Show less" : "Show all instructions"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Responsive card grid for practice activities.
 *
 * Every action carries its own word. Archive used to be an icon with a
 * screen-reader-only label and a tooltip, which is not available to a touch or
 * keyboard user at all, and neither Publish, Questions nor Restore existed.
 *
 * @param {object} props
 * @param {Array<object>} [props.activities] - Activity records to display
 * @param {Map<string, string>} [props.moduleTitles] - Module id to title
 * @param {boolean} [props.isLoading] - Loading state flag
 * @param {boolean} [props.hasError] - Whether the last read failed
 * @param {boolean} [props.hasSearchOrFilter] - Whether query filters are active
 * @param {{activityId: string, message: string}|null} [props.publishRefusal] - The
 *   last refusal the API gave for one of these rows, so the reason outlives the
 *   dialog the teacher dismissed
 * @param {(activity: object) => void} [props.onEdit]
 * @param {(activity: object) => void} [props.onQuestions]
 * @param {(activity: object) => void} [props.onPublish]
 * @param {(activity: object) => void} [props.onArchive]
 * @param {(activity: object) => void} [props.onRestore]
 * @param {() => void} [props.onCreate]
 * @returns {JSX.Element|null}
 */
export function ActivityList({
  activities = [],
  moduleTitles = new Map(),
  isLoading = false,
  hasError = false,
  hasSearchOrFilter = false,
  publishRefusal = null,
  onEdit,
  onQuestions,
  onPublish,
  onArchive,
  onRestore,
  onDelete,
  onCreate,
}) {
  if (isLoading) {
    return <ActivityListSkeleton />;
  }

  // A failed read already says so above this grid. Rendering "no activities
  // yet" and an invitation to create one underneath it contradicted the banner
  // and invited acting on a list nobody could read.
  if (hasError) {
    return null;
  }

  if (activities.length === 0) {
    return <ActivityListEmpty hasSearchOrFilter={hasSearchOrFilter} onCreate={onCreate} />;
  }

  return (
    // `items-start`, so a card is as tall as what it holds. Grid items stretch
    // to the tallest cell in their row by default, and the card then had to
    // spread its three sections over that height — which is where the empty
    // band between the metrics and the footer came from.
    <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
      {activities.map((activity) => {
        const moduleTitle = moduleTitles.get(activity.module_id) ?? "Learning module";
        const isArchived = activity.status === "archived";
        const isDraft = activity.status === "draft";
        const questionCount = activity.question_count ?? 0;
        const readiness = describeActivityReadiness(activity);
        const refusal =
          publishRefusal?.activityId === activity.activity_id
            ? publishRefusal.message
            : null;

        return (
          // The primitive's own `gap-6` and `py-6` sat on top of each
          // section's padding, so every seam was spaced twice. The sections
          // carry their own rhythm here and the card carries none.
          <Card
            key={activity.activity_id}
            className="flex flex-col gap-0 overflow-hidden border-border bg-card py-0"
          >
            <CardHeader className="gap-3 px-5 pt-5 pb-0">
              <div className="flex w-full min-w-0 items-center justify-between gap-2">
                <span className="inline-flex min-w-0 shrink items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                  <BookOpen className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{moduleTitle}</span>
                </span>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  <ActivityStatusBadge status={activity.status} />
                  {/*
                    Readiness is a second badge and a line beneath, not a
                    rewrite of the first badge. Published and ready are two
                    separate facts: an activity that was published is being
                    offered to learners right now, which is exactly why an
                    unready one is worth interrupting for, so overwriting
                    "Published" with "Not ready" would hide the urgency rather
                    than explain it. The badge is what makes the card findable
                    in a grid of eighteen, and a badge has no room for which
                    dependency is missing — so the sentence that names it, and
                    the control that fixes it, go inside the card where there
                    is room for both.
                  */}
                  {readiness ? <ActivityReadinessBadge /> : null}
                </div>
              </div>

              <h3 className="font-display text-base font-bold tracking-tight break-words text-foreground">
                {activity.title}
              </h3>
            </CardHeader>

            <CardContent className="space-y-3 px-5 pt-3 pb-0">
              <ActivityInstructions text={activity.description} />

              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-2.5 text-xs sm:grid-cols-4">
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <ListChecks className="size-3 text-muted-foreground" aria-hidden="true" />
                    Questions
                  </span>
                  <span className="font-semibold text-foreground">{questionCount}</span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Clock className="size-3 text-muted-foreground" aria-hidden="true" />
                    Time
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatDuration(activity.estimated_minutes)}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Trophy className="size-3 text-muted-foreground" aria-hidden="true" />
                    Points
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatPoints(activity.points)}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Target className="size-3 text-muted-foreground" aria-hidden="true" />
                    Pass
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatMasteryThreshold(activity.mastery_threshold)}
                  </span>
                </div>
              </div>

              {isDraft && questionCount === 0 ? (
                <p className="border-l-[3px] border-destructive bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-foreground">
                  This activity holds no questions, so it cannot be published yet.
                </p>
              ) : null}

              {/*
                A refusal outranks the card's own reading of readiness. The
                server checked this activity a moment ago and named the one
                condition that failed; `is_ready` only knows that one of them
                did. Both lead to the same place, so the same note carries both.
              */}
              {refusal ? (
                <ActivityReadinessNote
                  headline="It could not be published"
                  detail={refusal}
                  title={activity.title}
                  onFix={onQuestions ? () => onQuestions(activity) : undefined}
                />
              ) : readiness ? (
                <ActivityReadinessNote
                  headline={readiness.headline}
                  detail={readiness.detail}
                  title={activity.title}
                  onFix={onQuestions ? () => onQuestions(activity) : undefined}
                />
              ) : null}
            </CardContent>

            {/*
              `border-t-[1px]` rather than `border-t`: the primitive reserves
              24px of top padding for anything carrying the literal `border-t`
              class, and that rule outranks a padding utility, which is half of
              why the actions sat so far from the card.
            */}
            <CardFooter className="mt-4 flex flex-col gap-2 border-t-[1px] border-border/60 px-5 pt-3 pb-4 text-xs text-muted-foreground">
              <span className="self-start">
                Updated {formatDate(activity.updated_at || activity.created_at)}
              </span>

              <div className="flex w-full flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onEdit?.(activity)}
                >
                  <Edit2 className="size-3.5" aria-hidden="true" />
                  Edit
                  <span className="sr-only"> {activity.title}</span>
                </Button>

                {!isArchived && onQuestions ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onQuestions(activity)}
                  >
                    <ListChecks className="size-3.5" aria-hidden="true" />
                    Questions
                    <span className="sr-only"> in {activity.title}</span>
                  </Button>
                ) : null}

                {isDraft && onPublish ? (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onPublish(activity)}
                  >
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    Publish
                    <span className="sr-only"> {activity.title}</span>
                  </Button>
                ) : null}

                {!isArchived && onArchive ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onArchive(activity)}
                  >
                    <Archive className="size-3.5" aria-hidden="true" />
                    Archive
                    <span className="sr-only"> {activity.title}</span>
                  </Button>
                ) : null}

                {isArchived && onRestore ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onRestore(activity)}
                  >
                    <ArchiveRestore className="size-3.5" aria-hidden="true" />
                    Restore
                    <span className="sr-only"> {activity.title}</span>
                  </Button>
                ) : null}

                {/*
                  Only on an archived row, because only an archived record is
                  in scope for removal at all. Archive stays the separate,
                  safer action; this one is reached through it.
                */}
                {isArchived && onDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onDelete(activity)}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Delete permanently
                    <span className="sr-only"> {activity.title}</span>
                  </Button>
                ) : null}
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
