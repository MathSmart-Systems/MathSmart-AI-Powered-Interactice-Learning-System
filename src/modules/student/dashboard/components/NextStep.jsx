import React from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Clock3, Compass, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMinutes } from "../utils/format";

const ICON_FOR_KIND = {
  diagnostic: Compass,
  module: Compass,
  all_done: CircleCheck,
  no_path: Clock3,
};

/**
 * Primary Next Step Action Card conforming to the MathSmart UI/UX reference.
 * Highlights the learner's recommended competency or immediate diagnostic action
 * with an engaging gradient surface, progress metadata, and clear primary CTA.
 */
export function NextStep({ action, headingId }) {
  const Icon = ICON_FOR_KIND[action.kind] ?? Compass;
  const minutes = formatMinutes(action.meta?.minutes);

  return (
    <section
      aria-labelledby={headingId}
      className="relative rounded-2xl p-6 sm:p-8 text-white shadow-md overflow-hidden border border-border/20 bg-gradient-to-br from-primary via-primary/95 to-shell"
    >
      <div aria-hidden="true" className="grid-paper absolute inset-0 opacity-20 pointer-events-none" />

      <div className="relative z-10 max-w-2xl space-y-4">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 text-white/90 text-xs font-medium backdrop-blur-xs border border-white/15">
          <Icon className="size-3.5 text-amber-300" aria-hidden="true" />
          <span>{action.eyebrow}</span>
        </div>

        <div className="space-y-2">
          <h2
            id={headingId}
            className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-white"
          >
            {action.title}
          </h2>
          <p className="text-white/90 text-sm leading-relaxed max-w-xl">
            {action.description}
          </p>
        </div>

        {action.meta ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/80 pt-1 border-t border-white/10">
            {action.meta.competency ? (
              <span>
                <strong className="text-white font-semibold">Competency:</strong> {action.meta.competency}
              </span>
            ) : null}
            {action.meta.statusLabel ? (
              <span>
                <strong className="text-white font-semibold">Status:</strong> {action.meta.statusLabel}
              </span>
            ) : null}
            {minutes ? (
              <span>
                <strong className="text-white font-semibold">Time needed:</strong> {minutes}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <Button
            asChild
            className="h-11 inline-flex items-center gap-2 px-6 rounded-xl bg-white text-slate-900 font-bold text-sm shadow-sm hover:bg-white/90 transition-all cursor-pointer"
          >
            <Link href={action.href}>
              <PlayCircle className="size-4 text-primary shrink-0" aria-hidden="true" />
              <span>{action.cta}</span>
              <ArrowRight className="size-4 text-primary ml-1 shrink-0" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
