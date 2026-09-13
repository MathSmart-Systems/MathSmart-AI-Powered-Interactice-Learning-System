"use client";

import { useMemo } from "react";
import {
  Archive,
  BookOpen,
  Clock,
  Edit2,
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

/**
 * Loading skeleton cards shown while fetching activities.
 *
 * @returns {JSX.Element}
 */
function ActivityListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="animate-pulse border-border/70 shadow-xs">
          <CardHeader className="space-y-2 pb-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 rounded-md bg-muted" />
              <div className="h-5 w-16 rounded-md bg-muted" />
            </div>
            <div className="h-6 w-3/4 rounded-md bg-muted" />
          </CardHeader>
          <CardContent className="space-y-3 pb-4">
            <div className="h-4 w-full rounded bg-muted/80" />
            <div className="h-4 w-5/6 rounded bg-muted/60" />
          </CardContent>
          <CardFooter className="flex items-center justify-between border-t border-border/50 pt-3">
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-8 w-16 rounded bg-muted" />
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/50 p-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
        <Shapes className="size-7" aria-hidden="true" />
      </div>
      <h3 className="font-display text-lg font-bold text-foreground">
        {hasSearchOrFilter ? "No matching activities found" : "No practice activities yet"}
      </h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground leading-relaxed">
        {hasSearchOrFilter
          ? "Try adjusting your search query, status, or module filter to find what you need."
          : "Author practice activities to provide learners with formative drills and application exercises."}
      </p>
      {!hasSearchOrFilter && onCreate ? (
        <Button
          type="button"
          onClick={onCreate}
          className="mt-6 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
        >
          <Plus className="size-4" aria-hidden="true" />
          Create First Activity
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Responsive card grid for practice activities.
 *
 * @param {object} props
 * @param {Array<object>} [props.activities] - Activity records to display
 * @param {Array<object>} [props.modules] - Associated learning modules for name resolution
 * @param {boolean} [props.isLoading] - Loading state flag
 * @param {boolean} [props.hasSearchOrFilter] - Whether query filters are active
 * @param {(activity: object) => void} [props.onEdit] - Edit callback
 * @param {(activity: object) => void} [props.onArchive] - Archive callback
 * @param {() => void} [props.onCreate] - Create callback
 * @returns {JSX.Element}
 */
export function ActivityList({
  activities = [],
  modules = [],
  isLoading = false,
  hasSearchOrFilter = false,
  onEdit,
  onArchive,
  onCreate,
}) {
  const moduleMap = useMemo(() => {
    const map = new Map();
    for (const mod of modules) {
      map.set(mod.module_id, mod.title);
    }
    return map;
  }, [modules]);

  if (isLoading) {
    return <ActivityListSkeleton />;
  }

  if (activities.length === 0) {
    return (
      <ActivityListEmpty
        hasSearchOrFilter={hasSearchOrFilter}
        onCreate={onCreate}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {activities.map((activity) => {
        const moduleTitle = moduleMap.get(activity.module_id) ?? "Learning Module";
        const isArchived = activity.status === "archived";

        return (
          <Card
            key={activity.activity_id}
            className="group flex flex-col justify-between border-border/80 bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200"
          >
            <CardHeader className="space-y-3 pb-3">
              <div className="flex items-start justify-between gap-2">
                <span
                  title={moduleTitle}
                  className="inline-flex items-center gap-1.5 rounded-md bg-secondary/80 px-2 py-0.5 text-xs font-semibold text-secondary-foreground truncate max-w-[200px]"
                >
                  <BookOpen className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{moduleTitle}</span>
                </span>
                <ActivityStatusBadge status={activity.status} className="shrink-0" />
              </div>

              <h3 className="font-display text-base font-bold text-foreground tracking-tight group-hover:text-primary transition-colors line-clamp-2">
                {activity.title}
              </h3>
            </CardHeader>

            <CardContent className="space-y-4 pb-4">
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 min-h-[2rem]">
                {activity.description || "No description provided for this activity."}
              </p>

              <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-2.5 text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <Clock className="size-3 text-primary/70" aria-hidden="true" />
                    Time
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatDuration(activity.estimated_minutes)}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <Trophy className="size-3 text-amber-500" aria-hidden="true" />
                    Points
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatPoints(activity.points)}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <Target className="size-3 text-emerald-600" aria-hidden="true" />
                    Pass
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatMasteryThreshold(activity.mastery_threshold)}
                  </span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <span>Updated {formatDate(activity.updated_at || activity.created_at)}</span>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-3 text-xs font-medium"
                  onClick={() => onEdit?.(activity)}
                >
                  <Edit2 className="size-3.5" aria-hidden="true" />
                  Edit
                </Button>

                {!isArchived && onArchive ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Archive activity"
                    onClick={() => onArchive?.(activity)}
                  >
                    <Archive className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">Archive {activity.title}</span>
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
