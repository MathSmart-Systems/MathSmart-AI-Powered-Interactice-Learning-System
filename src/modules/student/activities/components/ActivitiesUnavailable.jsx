import Link from "next/link";
import { Clover, Shapes, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

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
        <p className="max-w-prose text-sm leading-relaxed text-foreground">
          MathSmart could not reach the service that keeps your practice
          activities. Nothing you have finished is lost. Try again in a moment,
          and tell your teacher if it keeps happening.
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