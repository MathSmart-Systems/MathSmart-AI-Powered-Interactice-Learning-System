import Link from "next/link";
import { Clover, Lock, SearchX, Shapes, TriangleAlert, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";

import { REFUSAL } from "../utils/activities-model.js";

function Frame({ children }) {
  return (
    <div className="flex flex-col gap-8" aria-labelledby="activities-heading">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">Student activities</p>
        <h1 id="activities-heading" className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Activities
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
      </header>

      {children}
    </div>
  );
}

/**
 * What the Activities page shows when it cannot show the catalogue.
 *
 * A service that did not answer is a genuine problem, marked in the marking-pen
 * red with a retry. A learner record that does not exist yet is not a fault, so
 * it points at the teacher who can create one.
 */
export function ActivitiesServiceError() {
  return (
    <Frame>
      <section
        aria-labelledby="activities-error-heading"
        className="flex max-w-2xl flex-col gap-4 border-l-[3px] border-destructive bg-destructive/5 px-6 py-6"
      >
        <div className="flex items-center gap-2.5 text-destructive">
          <TriangleAlert aria-hidden="true" className="size-4" />
          <h2 id="activities-error-heading" className="text-base font-semibold">
            Your activities could not be loaded
          </h2>
        </div>
        {/*
          Deliberately not "check your connection": this read fails for a
          timeout, for a refusal and for a reply that would not parse, and
          telling a learner their connection is at fault when it is not sends
          them off to fix something that was never broken.
        */}
        <p className="max-w-prose text-sm leading-relaxed text-foreground">
          MathSmart could not load your practice activities just now. Nothing
          you have finished is lost. Try again in a moment, and tell your
          teacher if it keeps happening.
        </p>
        <p className="text-sm text-muted-foreground">Refresh the page to try again.</p>
      </section>
    </Frame>
  );
}

export function ActivitiesNoProfile() {
  return (
    <Frame>
      <section
        aria-labelledby="activities-no-profile-heading"
        className="flex max-w-2xl flex-col gap-4 border-l-[3px] border-primary bg-card px-6 py-6"
      >
        <div className="flex items-center gap-2.5 text-primary">
          <Clover aria-hidden="true" className="size-4" />
          <h2 id="activities-no-profile-heading" className="text-base font-semibold">
            Your learner record is not set up yet
          </h2>
        </div>
        <p className="max-w-prose text-sm leading-relaxed text-foreground">
          You are signed in, but no Grade 6 learner record is linked to this
          account yet, so there are no activities to show. Ask your teacher to
          finish enrolling you and this page will fill in on its own.
        </p>
        <div className="pt-1">
          <Button asChild variant="outline" className="h-11 px-5">
            <Link href="/student/dashboard">
              <Shapes aria-hidden="true" />
              Go to Dashboard
            </Link>
          </Button>
        </div>
      </section>
    </Frame>
  );
}

/** A picture per refusal, so the tone is never the only thing carrying it. */
const REFUSAL_ICON = Object.freeze({
  [REFUSAL.NOT_READY]: Wrench,
  [REFUSAL.LOCKED]: Lock,
  [REFUSAL.MISSING]: SearchX,
  [REFUSAL.FAULT]: TriangleAlert,
});

/**
 * What the player shows instead of an activity it was refused.
 *
 * A learner reaches this from a stale link, a typed URL, or an activity whose
 * questions were archived out from under them. Every one of those used to
 * arrive as the same red "Activity unavailable" panel, which tells a child
 * something broke — and three of the four are not breakages at all, they are
 * the server answering a fair question honestly. The unfinished, the not-yet-
 * open and the missing are therefore marked as notices, in the shell's own
 * pine green, and the marking-pen red is kept for a genuine fault.
 *
 * The sentence in the body is the server's own. It is written for a learner
 * and it is the only thing that knows which of several refusals this was, so
 * it is shown rather than replaced.
 */
export function ActivityRefusal({ refusal, message, onRetry }) {
  const Icon = REFUSAL_ICON[refusal.kind] ?? TriangleAlert;
  const fault = refusal.isFault;
  // Retrying an activity that is not there cannot help. Retrying one a teacher
  // is in the middle of finishing can, so it stays offered.
  const canRetry = typeof onRetry === "function" && refusal.kind !== REFUSAL.MISSING;

  return (
    <section className="flex flex-col gap-8" aria-labelledby="player-error-heading">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">Student activities</p>
        <h1
          id="player-error-heading"
          className="font-display text-3xl font-semibold tracking-tight text-foreground"
        >
          {refusal.title}
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
      </header>

      <div
        role={fault ? "alert" : "status"}
        className={
          fault
            ? "flex max-w-2xl flex-col gap-4 border-l-[3px] border-destructive bg-destructive/5 px-6 py-6"
            : "flex max-w-2xl flex-col gap-4 border-l-[3px] border-primary bg-card px-6 py-6"
        }
      >
        <div
          className={
            fault
              ? "flex items-start gap-2.5 text-destructive"
              : "flex items-start gap-2.5 text-primary"
          }
        >
          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p className="text-base font-semibold text-foreground">
            {message ?? "This activity could not be opened."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {canRetry && (
            <Button variant="outline" className="h-11 px-5" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button asChild variant="outline" className="h-11 px-5">
            <Link href="/student/activities">Back to Activities</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
