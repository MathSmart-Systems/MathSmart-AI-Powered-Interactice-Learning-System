import React from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Clock3, Compass, PencilRuler } from "lucide-react";

import { LinkPending } from "@/modules/shared";

import { STUDENT_ROUTE } from "../utils/dashboard-model";
import { formatMinutes } from "../utils/format";

const ICON_FOR_KIND = {
  diagnostic: Compass,
  module: Compass,
  all_done: CircleCheck,
  no_path: Clock3,
  locked_path: Clock3,
};

/**
 * The one thing to do next, on the deep-shell panel that carries the page.
 *
 * This is the dashboard's single signature surface: the same ink as the
 * sidebar, the notebook grid ruled faintly across it. Everything on it is a
 * theme token — the panel used to reach for raw white and an amber from
 * outside the palette, which drifted from the shell it was meant to echo.
 *
 * The call to action goes to the lesson itself rather than the list it sits
 * in. The mastery bar that used to sit here is gone: it printed the score
 * unrounded, and the same score is already on the page, rounded, once.
 */
export function NextStep({ action, headingId }) {
  const Icon = ICON_FOR_KIND[action.kind] ?? Compass;
  const minutes = formatMinutes(action.meta?.minutes);
  const isModule = action.kind === "module";

  return (
    <section
      aria-labelledby={headingId}
      className="on-shell relative overflow-hidden rounded-2xl border border-shell-border bg-shell p-5 text-shell-foreground sm:p-7"
    >
      <div aria-hidden="true" className="grid-paper pointer-events-none absolute inset-0 opacity-20" />

      <div className="relative flex max-w-2xl flex-col gap-3">
        <p className="inline-flex w-fit items-center gap-1.5 rounded-md border border-shell-accent/30 px-2.5 py-1 text-xs font-semibold text-shell-accent">
          <Icon aria-hidden="true" className="size-3.5 shrink-0" />
          {action.eyebrow}
        </p>

        <div className="flex flex-col gap-1.5">
          <h2
            id={headingId}
            className="font-display text-2xl font-bold tracking-tight text-shell-foreground sm:text-3xl"
          >
            {action.title}
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-shell-muted">{action.description}</p>
        </div>

        {action.meta && (action.meta.competency || action.meta.statusLabel || minutes) ? (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-shell-muted">
            {action.meta.competency ? <span>Topic: {action.meta.competency}</span> : null}
            {action.meta.statusLabel ? <span>{action.meta.statusLabel}</span> : null}
            {minutes ? <span>{minutes}</span> : null}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            id="continue-learning-btn"
            href={action.href}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-shell-foreground px-5 text-sm font-bold text-shell transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-shell-accent"
          >
            {action.cta}
            <LinkPending />
            <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
          </Link>

          {isModule ? (
            <Link
              id="quick-activity-btn"
              href={STUDENT_ROUTE.ACTIVITIES}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-shell-border px-4 text-sm font-medium text-shell-foreground transition-colors hover:bg-shell-border/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-shell-accent"
            >
              <PencilRuler aria-hidden="true" className="size-4 shrink-0 text-shell-accent" />
              Go to practice
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
