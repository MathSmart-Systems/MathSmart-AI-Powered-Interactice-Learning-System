import Link from "next/link";
import { CircleCheck, Clock3, Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

import { formatMinutes } from "../utils/format";

/*
 * The one thing on this page that is louder than everything else.
 *
 * It is the deep-teal workspace panel from the login screen, carrying the same
 * graph-paper ruling and the same plotted point, because the answer to "what do
 * I do next" is the product's whole proposition. Its call to action is chalk
 * white on teal: the highest-contrast surface available here, which is what
 * makes it unmistakably the first thing to press.
 */

const ICON_FOR_KIND = {
  diagnostic: Compass,
  module: Compass,
  all_done: CircleCheck,
  no_path: Clock3,
};

export function NextStep({ action, headingId }) {
  const Icon = ICON_FOR_KIND[action.kind] ?? Compass;
  const minutes = formatMinutes(action.meta?.minutes);

  return (
    <section
      aria-labelledby={headingId}
      className="on-shell relative overflow-hidden border border-shell-border bg-shell text-shell-foreground"
    >
      {/*
       * The graph-paper ruling carries the identity on its own here. An axis
       * pair was tried alongside it and taken out again: the plot further down
       * the page is where a plotted point means something.
       */}
      <div aria-hidden="true" className="grid-paper absolute inset-0 opacity-70" />

      <div className="relative flex flex-col gap-5 px-6 py-7 sm:px-8 sm:py-9">
        <p className="flex items-center gap-2 text-sm font-medium text-shell-accent">
          <Icon aria-hidden="true" className="size-4" />
          {action.eyebrow}
        </p>

        <div className="flex flex-col gap-3">
          <h2
            id={headingId}
            className="max-w-[22ch] font-display text-3xl leading-tight font-semibold tracking-tight text-white sm:text-4xl"
          >
            {action.title}
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-shell-foreground sm:text-base">
            {action.description}
          </p>
        </div>

        {action.meta ? (
          <dl className="flex flex-col gap-1.5 border-l-2 border-shell-accent/60 pl-4 text-sm">
            {action.meta.competency ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-shell-muted">Competency</dt>
                <dd className="text-shell-foreground">{action.meta.competency}</dd>
              </div>
            ) : null}
            {action.meta.statusLabel ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-shell-muted">Status</dt>
                <dd className="text-shell-foreground">{action.meta.statusLabel}</dd>
              </div>
            ) : null}
            {minutes ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-shell-muted">Time needed</dt>
                <dd className="text-shell-foreground">{minutes}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="pt-1">
          <Button
            asChild
            className="h-12 w-full bg-background px-6 text-base font-semibold text-shell hover:bg-white sm:w-auto"
          >
            <Link href={action.href}>{action.cta}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
