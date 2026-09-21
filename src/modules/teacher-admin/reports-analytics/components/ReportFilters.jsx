"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NATIVE_SELECT_CLASS } from "@/modules/shared/utils/native-select";

import { STATUS_OPTIONS, isFiltered } from "../utils/report-filters.js";

const IDS = {
  section: "report-filter-section",
  competency: "report-filter-competency",
  status: "report-filter-status",
  from: "report-filter-from",
  to: "report-filter-to",
};

function Field({ id, label, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * The report's filters. Each change replaces the address at once; the note
 * underneath has one reserved line, so saying "Updating…" moves nothing.
 */
export function ReportFilters({ filters, sections, competencies, onChange, onReset, pending, menusUnavailable }) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section aria-label="Report filters" className="rounded-xl border border-border bg-card p-4 print:hidden">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto] xl:items-end">
        <Field id={IDS.section} label="Section">
          <select
            id={IDS.section}
            className={NATIVE_SELECT_CLASS}
            value={filters.sectionId ?? ""}
            onChange={(event) => onChange("sectionId", event.target.value)}
          >
            <option value="">All Grade 6 sections</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id={IDS.competency} label="Competency">
          <select
            id={IDS.competency}
            className={NATIVE_SELECT_CLASS}
            value={filters.competencyId ?? ""}
            onChange={(event) => onChange("competencyId", event.target.value)}
          >
            <option value="">All competencies</option>
            {competencies.map((competency) => (
              <option key={competency.id} value={competency.id}>
                {competency.code ? `${competency.code} · ` : ""}
                {competency.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id={IDS.status} label="Student status">
          <select
            id={IDS.status}
            className={NATIVE_SELECT_CLASS}
            value={filters.status ?? ""}
            onChange={(event) => onChange("status", event.target.value)}
          >
            <option value="">Any status</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id={IDS.from} label="From">
          <Input
            id={IDS.from}
            type="date"
            value={filters.from ?? ""}
            max={filters.to ?? today}
            onChange={(event) => onChange("from", event.target.value)}
          />
        </Field>
        <Field id={IDS.to} label="To">
          <Input
            id={IDS.to}
            type="date"
            value={filters.to ?? ""}
            min={filters.from ?? undefined}
            max={today}
            onChange={(event) => onChange("to", event.target.value)}
          />
        </Field>
        <div className="flex items-end">
          <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={!isFiltered(filters)} className="h-9">
            <RotateCcw aria-hidden="true" className="size-3.5" />
            Clear filters
          </Button>
        </div>
      </div>
      <p className="mt-2 flex min-h-4 items-center gap-1.5 text-xs text-muted-foreground">
        {pending ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
            Updating the report…
          </>
        ) : menusUnavailable ? (
          "Some filter choices could not be loaded. The report below is still complete."
        ) : (
          "Dates narrow assessments, practice, questions and interventions. Mastery and growth are current."
        )}
      </p>
    </section>
  );
}
