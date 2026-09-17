"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, Sparkles } from "lucide-react";

import { FIELD_IDS, TEACHER_ROUTES } from "../utils/constants.js";

export function DashboardHeader({
  model,
  selectedSectionId,
  onSectionChange,
  isRefreshing = false,
  classesUnavailable = false,
}) {
  const { totals, sections } = model;
  // openInterventionCount = actual recorded intervention records in DB.
  // needsSupportCount = mastery-band flag (different meaning — not shown on this button).
  const interventionCount = totals?.openInterventionCount ?? 0;

  return (
    <div className="bg-card rounded-2xl p-6 sm:p-8 border border-border shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transition-colors">
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent text-accent-foreground text-xs font-semibold">
          <Sparkles className="size-3.5 text-primary" />
          <span>ARAL Mathematics Class Monitoring Hub</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground font-display tracking-tight">
          Grade 6 Mathematics Dashboard
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">
          Real-time competency tracking, automated gap detection, and teacher-led intervention workflow.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 self-stretch sm:self-auto">
        {classesUnavailable && (
          <p
            role="status"
            className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground"
          >
            Section filtering is temporarily unavailable. Showing all Grade 6 sections.
          </p>
        )}
        {/* Section Filter Dropdown */}
        {sections && sections.length > 0 && (
          <div className="relative flex-1 sm:flex-initial min-w-[160px]">
            <select
              id={FIELD_IDS.SECTION_FILTER}
              value={selectedSectionId || ""}
              onChange={(e) => onSectionChange(e.target.value || null)}
              disabled={isRefreshing}
              className="w-full appearance-none rounded-xl border border-input bg-card py-2.5 pl-3.5 pr-9 text-xs font-semibold text-foreground shadow-2xs outline-none transition-colors hover:bg-muted/40 focus:border-ring focus:ring-[3px] focus:ring-ring/50 disabled:opacity-50 cursor-pointer"
            >
              <option value="">All Grade 6 Sections</option>
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name} {sec.learnerCount ? `(${sec.learnerCount} students)` : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          </div>
        )}

        {/* Review Interventions CTA Button */}
        <Link
          id={FIELD_IDS.REVIEW_INTERVENTIONS_BTN}
          href={TEACHER_ROUTES.INTERVENTIONS}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-destructive text-white font-bold text-xs shadow-xs hover:bg-destructive/90 transition-colors cursor-pointer shrink-0"
        >
          <AlertTriangle className="size-4" />
          <span>Review Interventions ({interventionCount})</span>
        </Link>
      </div>
    </div>
  );
}
