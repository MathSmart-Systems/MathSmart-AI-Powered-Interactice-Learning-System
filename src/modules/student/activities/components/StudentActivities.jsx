import Link from "next/link";
import { Clock, Lock, Shapes, Star, Wrench } from "lucide-react";

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
import { activityGate } from "../utils/activities-model.js";
import { formatBestScore, formatMinutes, formatPoints } from "../utils/format.js";
import { ActivitiesNoProfile, ActivitiesServiceError } from "./ActivitiesUnavailable.jsx";

export { StudentActivitiesSkeleton } from "./StudentActivitiesSkeleton.jsx";

/**
 * A glyph per closed state, so "you cannot start this" never rests on a
 * dimmed button alone. The two reasons are deliberately different pictures:
 * a padlock is something that opens with time, a spanner is someone still
 * working on it.
 */
const GATE_ICON = Object.freeze({ locked: Lock, not_ready: Wrench });

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
          // One answer for both reasons a card cannot be started: the path has
          // not opened it, or the API says a start request would be refused.
          // Anything the gate closes gets the same treatment, so a learner
          // meets one recognisable shape rather than two inventions.
          const gate = activityGate(activity);
          const GateIcon = gate ? GATE_ICON[gate.kind] : null;
          const verb = gate ? null : activity.status.verb;

          return (
            <li key={activity.activityId}>
              <Card
                className={gate ? "opacity-80" : undefined}
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

                {/*
                  Wrapping, because the status badge and a full-size action
                  button do not both fit on one line at 320px: without it the
                  button was squeezed until its label broke mid-word.
                */}
                <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
                  <Badge variant="outline" className="font-normal">
                    {GateIcon && <GateIcon aria-hidden="true" className="mr-1 size-3" />}
                    {gate ? gate.label : activity.status.label}
                  </Badge>
                  {verb ? (
                    <Button asChild size="lg">
                      <Link href={href}>{verb}</Link>
                    </Button>
                  ) : (
                    // No `asChild` here. It hands the child straight to Radix's
                    // Slot, which needs a single element and was given a bare
                    // string — so every render of a locked card threw "Slot
                    // failed to slot onto its children" and took the whole page
                    // with it. Nothing was ever locked before the learning path
                    // started moving, which is why it had never been seen.
                    //
                    // `aria-disabled` rather than `disabled`, so the reason
                    // stays reachable by keyboard instead of the card being
                    // skipped over in silence.
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      aria-disabled="true"
                      className="cursor-not-allowed opacity-70"
                    >
                      {GateIcon && <GateIcon aria-hidden="true" className="size-4" />}
                      {gate?.label}
                      <span className="sr-only">: {activity.title}</span>
                    </Button>
                  )}
                  {/*
                    The reason, on its own line, for whichever gate closed the
                    card. `basis-full` rather than a third item in the row: at
                    320px a sentence beside the badge and the button squeezed
                    both, and a learner who is being told they cannot start
                    something is owed the explanation in full width.
                  */}
                  {gate && (
                    <p className="basis-full text-sm leading-relaxed text-muted-foreground">
                      {gate.hint}
                    </p>
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