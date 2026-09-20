"use client";

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
  onEdit,
  onQuestions,
  onPublish,
  onArchive,
  onRestore,
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
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {activities.map((activity) => {
        const moduleTitle = moduleTitles.get(activity.module_id) ?? "Learning module";
        const isArchived = activity.status === "archived";
        const isDraft = activity.status === "draft";
        const questionCount = activity.question_count ?? 0;

        return (
          <Card
            key={activity.activity_id}
            className="flex flex-col justify-between overflow-hidden border-border bg-card"
          >
            <CardHeader className="space-y-3 pb-3">
              <div className="flex w-full min-w-0 items-center justify-between gap-2">
                <span className="inline-flex min-w-0 shrink items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                  <BookOpen className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{moduleTitle}</span>
                </span>
                <ActivityStatusBadge status={activity.status} className="shrink-0" />
              </div>

              <h3 className="font-display text-base font-bold tracking-tight break-words text-foreground">
                {activity.title}
              </h3>
            </CardHeader>

            <CardContent className="space-y-4 pb-4">
              <p className="min-h-8 text-xs leading-relaxed break-words text-muted-foreground">
                {activity.description || "No instructions written for this activity yet."}
              </p>

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
            </CardContent>

            <CardFooter className="flex flex-col gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
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
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
