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
 * Primary Next Step Action Card conforming to the MathSmart UI/UX reference.
 * Highlights the learner's recommended competency or immediate diagnostic action
 * with an engaging indigo gradient surface, progress indicator, and clear CTA buttons.
 */
export function NextStep({ action, headingId }) {
  const Icon = ICON_FOR_KIND[action.kind] ?? Compass;
  const minutes = formatMinutes(action.meta?.minutes);
  const masteryScore = action.meta?.masteryScore ?? null;
  const isModule = action.kind === "module";

  return (
    <section
      aria-labelledby={headingId}
      className="bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden"
    >
      <div className="relative z-10 max-w-2xl space-y-4">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/30 text-indigo-200 text-xs font-medium backdrop-blur-xs border border-indigo-400/30">
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
          <p className="text-indigo-100 text-sm leading-relaxed max-w-xl">
            {action.description}
          </p>
        </div>

        {/* Competency Progress Indicator (when mastery score is available) */}
        {masteryScore !== null && masteryScore !== undefined ? (
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs font-medium text-indigo-200 mb-1.5">
              <span>Current Mastery Progress</span>
              <span className="font-bold text-white">{masteryScore}%</span>
            </div>
            <div className="h-2.5 w-full bg-indigo-950/60 rounded-full overflow-hidden p-0.5 border border-indigo-400/20">
              <div
                className="h-full bg-gradient-to-r from-teal-400 to-emerald-300 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, masteryScore))}%` }}
              />
            </div>
          </div>
        ) : null}

        {action.meta ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-indigo-200/80 pt-1 border-t border-indigo-400/20">
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
          <Link
            id="continue-learning-btn"
            href={action.href}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-indigo-900 font-bold text-sm shadow-sm hover:bg-indigo-50 transition-all cursor-pointer"
          >
            <PlayCircle className="w-4 h-4 text-indigo-600 shrink-0" aria-hidden="true" />
            <span>{action.cta}</span>
            <ArrowRight className="w-4 h-4 text-indigo-600 ml-1 shrink-0" aria-hidden="true" />
          </Link>

          {isModule ? (
            <Link
              id="quick-activity-btn"
              href={STUDENT_ROUTE.ACTIVITIES}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-indigo-600/60 text-white font-medium text-sm hover:bg-indigo-600/90 transition-colors border border-indigo-400/30 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
              <span>Jump to Interactive Practice</span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
