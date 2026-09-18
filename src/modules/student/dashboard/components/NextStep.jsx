import React from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Clock3, Compass, PlayCircle, Sparkles } from "lucide-react";

import { STUDENT_ROUTE } from "../utils/dashboard-model";
import { formatMinutes } from "../utils/format";

const ICON_FOR_KIND = {
  diagnostic: Compass,
  module: Compass,
  all_done: CircleCheck,
  no_path: Clock3,
};

/**
 * Primary Next Step Action Card conforming to the MathSmart UI/UX reference
 * while honoring the system's signature pine-tree and deep-shell colorway.
 *
 * Features:
 * - Rich pine-to-shell gradient surface matching the sidebar's dark ink tones.
 * - Soft shell-accent ambient glow and badges.
 * - Dynamic competency mastery progress indicator.
 * - High-contrast white CTA button with pine-green typography and iconography.
 * - Secondary translucent action button for interactive practice.
 */
export function NextStep({ action, headingId }) {
  const Icon = ICON_FOR_KIND[action.kind] ?? Compass;
  const minutes = formatMinutes(action.meta?.minutes);
  const masteryScore = action.meta?.masteryScore ?? null;
  const isModule = action.kind === "module";

  return (
    <section
      aria-labelledby={headingId}
      className="on-shell relative rounded-2xl p-6 sm:p-8 text-white shadow-md overflow-hidden border border-white/15 bg-gradient-to-br from-primary via-primary/95 to-shell"
    >
      {/* MathSmart notebook grid texture */}
      <div aria-hidden="true" className="grid-paper absolute inset-0 opacity-20 pointer-events-none" />

      {/* Subtle pine/mint ambient accent glow */}
      <div
        aria-hidden="true"
        className="absolute -top-24 -right-24 size-64 rounded-full bg-shell-accent/15 blur-3xl pointer-events-none"
      />

      <div className="relative z-10 max-w-2xl space-y-4">
        {/* Eyebrow badge with pine/shell accent */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 text-shell-accent text-xs font-semibold backdrop-blur-xs border border-shell-accent/30">
          <Icon className="size-3.5 text-amber-300 shrink-0" aria-hidden="true" />
          <span>{action.eyebrow}</span>
        </div>

        <div className="space-y-2">
          <h2
            id={headingId}
            className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-white"
          >
            {action.title}
          </h2>
          <p className="text-shell-foreground/90 text-sm leading-relaxed max-w-xl">
            {action.description}
          </p>
        </div>

        {/* Competency Progress Indicator (when mastery score is available) */}
        {masteryScore !== null && masteryScore !== undefined ? (
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs font-medium text-shell-accent mb-1.5">
              <span>Current Mastery Progress</span>
              <span className="font-bold text-white">{masteryScore}%</span>
            </div>
            <div className="h-2.5 w-full bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/15">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-teal-300 to-shell-accent rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, masteryScore))}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Metadata row */}
        {action.meta ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-shell-muted pt-1 border-t border-white/10">
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

        {/* Action Buttons */}
        <div className="pt-2 flex flex-wrap items-center gap-3">
          <Link
            id="continue-learning-btn"
            href={action.href}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-shell font-bold text-sm shadow-sm hover:bg-white/95 hover:shadow-md transition-all cursor-pointer"
          >
            <PlayCircle className="size-4 text-primary shrink-0" aria-hidden="true" />
            <span>{action.cta}</span>
            <ArrowRight className="size-4 text-primary ml-1 shrink-0" aria-hidden="true" />
          </Link>

          {isModule ? (
            <Link
              id="quick-activity-btn"
              href={STUDENT_ROUTE.ACTIVITIES}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 text-white font-medium text-sm hover:bg-white/20 transition-colors border border-white/20 cursor-pointer backdrop-blur-xs"
            >
              <Sparkles className="size-4 text-amber-300 shrink-0" aria-hidden="true" />
              <span>Jump to Interactive Practice</span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
