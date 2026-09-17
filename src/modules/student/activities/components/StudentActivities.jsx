import Link from "next/link";
import { Clock, Lock, Shapes, Star } from "lucide-react";

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

import { ACTIVITIES_STATE, readActivityList } from "../services/activities-data.js";
import { formatBestScore, formatMinutes, formatPoints } from "../utils/format.js";
import { ActivitiesNoProfile, ActivitiesServiceError } from "./ActivitiesUnavailable.jsx";

export { StudentActivitiesSkeleton } from "./StudentActivitiesSkeleton.jsx";

/**
 * The learner's own practice activities catalogue.
 *
 * Reads server-side. The attempt count and best score shown on each card belong
 * to the signed-in learner alone — the API computes them from the caller's
 * identity, never from anything the browser sends.
 */
export async function StudentActivities() {
  const result = await readActivityList();

  if (result.state === ACTIVITIES_STATE.ERROR) return <ActivitiesServiceError />;
  if (result.state === ACTIVITIES_STATE.NO_PROFILE) return <ActivitiesNoProfile />;

  const items = result.items ?? [];

  return (
    <section className="flex flex-col gap-8" aria-labelledby="activities-heading">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">Student activities</p>
        <h1 id="activities-heading" className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Activities
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Practice your current competencies with instant feedback. You can retry
          a question until you get it right before you finish.
        </p>
      </header>

      {items.length === 0 && (
        <div className="border border-border bg-card p-6">
          <div className="flex items-center gap-2.5 text-primary">
            <Shapes aria-hidden="true" className="size-4" />
            <h2 className="text-base font-semibold">No activities ready yet</h2>
          </div>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
            Your teacher has not published any practice activities yet. Keep
            following your learning path, and new activities will appear here.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-4">
        {items.map((activity) => {
          const href = `/student/activities/${activity.activityId}`;
          const locked = activity.pathStatus === "locked";
          const verb = locked ? null : activity.status.verb;

          return (
            <li key={activity.activityId}>
              <Card
                className={locked ? "opacity-80" : undefined}
              >
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    {activity.competencyName && (
                      <Badge variant="outline" className="font-normal">
                        {activity.competencyName}
                      </Badge>
                    )}
                    {activity.moduleTitle && (
                      <span className="text-xs text-muted-foreground">
                        {activity.moduleTitle}
                      </span>
                    )}
                  </div>

                  <CardTitle className="text-xl leading-snug">{activity.title}</CardTitle>
                  {activity.description && (
                    <CardDescription className="max-w-prose leading-relaxed">
                      {activity.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  {formatMinutes(activity.estimatedMinutes) && (
                    <span className="flex items-center gap-1.5">
                      <Clock aria-hidden="true" className="size-4" />
                      {formatMinutes(activity.estimatedMinutes)}
                    </span>
                  )}
                  {formatPoints(activity.points) && (
                    <span className="flex items-center gap-1.5">
                      <Star aria-hidden="true" className="size-4" />
                      {formatPoints(activity.points)}
                    </span>
                  )}
                  {activity.bestScore !== null && (
                    <span className="flex items-center gap-1.5">
                      Best score
                      <span className="font-medium text-foreground">
                        {formatBestScore(activity.bestScore)}
                      </span>
                    </span>
                  )}
                  {activity.attemptCount > 0 && (
                    <span>
                      {activity.attemptCount} {activity.attemptCount === 1 ? "attempt" : "attempts"}
                    </span>
                  )}
                </CardContent>

                <CardFooter className="flex items-center justify-between gap-3 border-t border-border pt-6">
                  <Badge variant="outline" className="font-normal">
                    {locked && <Lock aria-hidden="true" className="mr-1 size-3" />}
                    {activity.status.label}
                  </Badge>
                  {verb ? (
                    <Button asChild size="lg">
                      <Link href={href}>{verb}</Link>
                    </Button>
                  ) : (
                    <Button asChild size="lg" variant="outline" disabled>
                      Opens later
                    </Button>
                  )}
                </CardFooter>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}