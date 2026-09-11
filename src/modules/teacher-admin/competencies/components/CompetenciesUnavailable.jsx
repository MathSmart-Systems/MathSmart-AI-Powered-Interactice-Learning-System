import { TriangleAlert } from "lucide-react";

import { RetryButton } from "./RetryButton";

/** The failure wording for each thing that can stop a catalogue read. */
const REASON_COPY = Object.freeze({
  unconfigured: Object.freeze({
    title: "The competency catalogue is not set up",
    body: "MathSmart could not find its API address, so this page has nothing to read. A Curriculum Administrator needs to finish the environment setup before this workspace can open.",
  }),
  session: Object.freeze({
    title: "Your session could not be verified",
    body: "MathSmart could not confirm your Teacher/Administrator session, so the catalogue stays closed. Sign in again and retry.",
  }),
  unavailable: Object.freeze({
    title: "The competency catalogue could not be loaded",
    body: "MathSmart could not reach the service that keeps the curriculum. The catalogue is not lost. Try again in a moment.",
  }),
});

/**
 * What the page shows when it cannot show the catalogue.
 *
 * A teacher reads and changes this catalogue, so a read that fails is marked in
 * the marking-pen red and offers a retry in place. The wording names the actual
 * blocker rather than guessing, and the retry re-runs the same server render.
 */
export function CompetenciesUnavailable({ reason }) {
  const copy = REASON_COPY[reason] ?? REASON_COPY.unavailable;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Grade 6 mathematics</p>
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
          Competencies
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
      </header>

      <section
        aria-labelledby="competencies-error-heading"
        className="flex max-w-2xl flex-col gap-4 border-l-[3px] border-destructive bg-destructive/5 px-6 py-6"
      >
        <div className="flex items-center gap-2.5 text-destructive">
          <TriangleAlert aria-hidden="true" className="size-4" />
          <h2 id="competencies-error-heading" className="text-base font-semibold">
            {copy.title}
          </h2>
        </div>

        <p className="max-w-prose text-sm leading-relaxed text-foreground">{copy.body}</p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <RetryButton label="Try again" />
        </div>
      </section>
    </div>
  );
}