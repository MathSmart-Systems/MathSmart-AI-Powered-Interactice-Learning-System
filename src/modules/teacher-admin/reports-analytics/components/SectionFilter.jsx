import { School } from "lucide-react";

const FILTER_STYLE =
  "h-9 rounded-md border border-input bg-card text-foreground px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function SectionFilter({ sections, selectedSectionId, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2">
        <School className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-bold text-foreground">Filter by section:</span>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="reports-section-filter" className="sr-only">
          Select section
        </label>
        <select
          id="reports-section-filter"
          className={FILTER_STYLE}
          value={selectedSectionId ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
          disabled={disabled}
          aria-label="Filter reports by class section"
        >
          <option value="" className="bg-card text-foreground">All sections</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id} className="bg-card text-foreground">
              {section.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
