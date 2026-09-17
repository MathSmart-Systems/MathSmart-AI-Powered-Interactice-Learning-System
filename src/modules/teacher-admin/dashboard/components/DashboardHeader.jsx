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
    <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between transition-colors">
      <div className="flex flex-col gap-2">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Sparkles aria-hidden="true" className="size-3.5" />
          <span>ARAL Mathematics Class Monitoring Hub</span>
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
          Grade 6 Mathematics Dashboard
        </h1>
        <span aria-hidden="true" className="mt-1 block h-0.5 w-16 bg-primary" />
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Real-time competency tracking, automated gap detection, and teacher-led intervention workflow.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 self-stretch sm:self-auto shrink-0 md:pt-1">
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
          <div className="relative w-full sm:w-auto min-w-[180px]">
            <select
              id={FIELD_IDS.SECTION_FILTER}
              value={selectedSectionId || ""}
              onChange={(e) => onSectionChange(e.target.value || null)}
              disabled={isRefreshing}
              className="w-full appearance-none rounded-lg border border-border bg-card py-2.5 pl-3.5 pr-9 text-xs font-semibold text-foreground shadow-2xs outline-none transition-colors hover:bg-muted/40 focus:border-ring focus:ring-[3px] focus:ring-ring/50 disabled:opacity-50 cursor-pointer"
            >
              <option value="" className="bg-card text-foreground">All Grade 6 Sections</option>
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id} className="bg-card text-foreground">
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
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-xs shadow-xs hover:bg-primary/90 transition-colors cursor-pointer shrink-0"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span>Review Interventions ({interventionCount})</span>
        </Link>
      </div>
    </header>
  );
}
