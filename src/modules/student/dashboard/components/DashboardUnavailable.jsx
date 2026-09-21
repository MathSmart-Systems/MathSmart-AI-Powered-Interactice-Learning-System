import Link from "next/link";
import { TriangleAlert, UserRoundSearch } from "lucide-react";

import { Button } from "@/components/ui/button";

import { STUDENT_ROUTE } from "../utils/dashboard-model";

import { RetryButton } from "./RetryButton";

/**
 * What the dashboard shows when it cannot show the dashboard.
 *
 * Two different situations, kept apart on purpose. A service that did not
 * answer is a genuine software problem and is marked in the marking-pen red,
 * with a retry, because retrying is what fixes it. A learner record that does
 * not exist yet is not a fault at all, so it is written in the ordinary voice
 * and points at the person who can create one.
 */
function Frame({ children }) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Grade 6 mathematics</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
      </header>

      {children}
    </div>
  );
}

/**
 * What to say for each way the dashboard can fail.
 *
 * These used to be one sentence about an unreachable service, whatever had
 * happened — including an account that had been paused, where "try again in a
 * moment" was simply untrue. Each reason now says what is actually the case,
 * and a retry is offered only where one could help.
 */
const FAILURE = Object.freeze({
  unavailable: {
    heading: "Your progress could not be loaded",
    body: "MathSmart could not reach the service that keeps your scores. Nothing you have finished is lost. Try again in a moment, and tell your teacher if it keeps happening.",
    retry: true,
  },
  session: {
    heading: "Please sign in again",
    body: "Your session has ended, so MathSmart cannot show your progress. Sign in again and you will come straight back here.",
    retry: false,
    signIn: true,
  },
  account: {
    heading: "Your account is not active",
    body: "Your account has been paused, so your progress cannot be shown right now. Ask your teacher to check it.",
    retry: false,
  },
  unconfigured: {
    heading: "MathSmart is not set up here yet",
    body: "This copy of MathSmart is missing its connection to the progress service. Tell your teacher.",
    retry: false,
  },
});

export function DashboardServiceError({ reason = "unavailable" }) {
  const copy = FAILURE[reason] ?? FAILURE.unavailable;

  return (
    <Frame>
      <section
        aria-labelledby="dashboard-error-heading"
        className="flex max-w-2xl flex-col gap-4 border-l-[3px] border-destructive bg-destructive/5 px-6 py-6"
      >
        <div className="flex items-center gap-2.5 text-destructive">
          <TriangleAlert aria-hidden="true" className="size-4" />
          <h2 id="dashboard-error-heading" className="text-base font-semibold">
            {copy.heading}
          </h2>
        </div>

        <p className="max-w-prose text-sm leading-relaxed text-foreground">{copy.body}</p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {copy.retry ? <RetryButton label="Try again" /> : null}
          {copy.signIn ? (
            <Button asChild className="h-11 px-5">
              <Link href="/login">Sign in again</Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="h-11 px-5">
              <Link href={STUDENT_ROUTE.MY_LEARNING}>Go to My Learning</Link>
            </Button>
          )}
        </div>
      </section>
    </Frame>
  );
}

export function DashboardNoProfile() {
  return (
    <Frame>
      <section
        aria-labelledby="dashboard-no-profile-heading"
        className="flex max-w-2xl flex-col gap-4 border-l-[3px] border-primary bg-card px-6 py-6"
      >
        <div className="flex items-center gap-2.5 text-primary">
          <UserRoundSearch aria-hidden="true" className="size-4" />
          <h2 id="dashboard-no-profile-heading" className="text-base font-semibold">
            Your learner record is not set up yet
          </h2>
        </div>

        <p className="max-w-prose text-sm leading-relaxed text-foreground">
          You are signed in, but no Grade 6 learner record is linked to this account yet,
          so there is no progress to show. Ask your teacher to finish enrolling you and
          this page will fill in on its own.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <RetryButton label="Check again" />
        </div>
      </section>
    </Frame>
  );
}
