"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";

import { FIELD_IDS } from "../utils/constants.js";

export function RecommendedActionBanner({ action }) {
  if (!action) return null;

  return (
    /*
     * The banner's own title is the heading. It used to be an `h3` under the
     * page `h1` with nothing at `h2` between them, which left anyone moving by
     * heading unable to tell whether this belonged to the cards above it. The
     * eyebrow above stays plain text: it names the section, not the step.
     */
    <section
      aria-labelledby="progress-recommended-action-heading"
      className="p-5 rounded-2xl bg-primary/8 border border-primary/20 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
    >
      <div className="flex items-start sm:items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-xs mt-0.5 sm:mt-0">
          <Compass className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-wider">
            Recommended Next Step
          </p>
          <h2
            id="progress-recommended-action-heading"
            className="text-sm sm:text-base font-bold text-foreground font-display"
          >
            {action.title}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {action.description}
          </p>
        </div>
      </div>

      <div className="shrink-0 w-full sm:w-auto">
        <Link
          id={FIELD_IDS.RECOMMENDED_ACTION_BTN}
          href={action.href}
          className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-xs cursor-pointer"
        >
          <span>{action.cta}</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
