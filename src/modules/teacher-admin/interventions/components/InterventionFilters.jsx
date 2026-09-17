import { Filter } from "lucide-react";

const SELECT_STYLE =
  "h-9 rounded-md border border-input bg-card text-foreground px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Deterministic filter bar for the intervention queue.
 *
 * Every control maps to a documented backend filter (`severity`, `status`,
 * `competency_id`, `grade_id`, `section_id`). None of these decisions are made
 * by Groq.
 *
 * @param {object} props
 * @param {object} filters - Current filter state
 * @param {(key: string, value: string|null) => void} onChange
 * @param {Array<object>} [competencies]
 * @param {Array<object>} [grades]
 * @param {Array<object>} [sections]
 * @param {boolean} [disabled]
 * @param {Array<object>} [cases] - Current visible cases (for the count line)
 */
export function InterventionFilters({ filters, onChange, competencies = [], grades = [], sections = [], disabled = false, cases = [] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2" aria-hidden="true">
        <Filter className="size-4 text-muted-foreground" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">Filters</span>
      </div>

      <label className="sr-only" htmlFor="intervention-filter-severity">
        Severity
      </label>
      <select
        id="intervention-filter-severity"
        className={SELECT_STYLE}
        value={filters.severity ?? ""}
        onChange={(event) => onChange("severity", event.target.value || null)}
        disabled={disabled}
      >
        <option value="" className="bg-card text-foreground">All severities</option>
        <option value="HIGH" className="bg-card text-foreground">High priority</option>
        <option value="MEDIUM" className="bg-card text-foreground">Medium priority</option>
        <option value="LOW" className="bg-card text-foreground">Low priority</option>
      </select>

      <label className="sr-only" htmlFor="intervention-filter-status">
        Status
      </label>
      <select
        id="intervention-filter-status"
        className={SELECT_STYLE}
        value={filters.status ?? ""}
        onChange={(event) => onChange("status", event.target.value || null)}
        disabled={disabled}
      >
        <option value="" className="bg-card text-foreground">All statuses</option>
        <option value="Needs Intervention" className="bg-card text-foreground">Needs Intervention</option>
        <option value="In Progress" className="bg-card text-foreground">In Progress</option>
        <option value="Resolved" className="bg-card text-foreground">Resolved</option>
      </select>

      <label className="sr-only" htmlFor="intervention-filter-competency">
        Competency
      </label>
      <select
        id="intervention-filter-competency"
        className={SELECT_STYLE}
        value={filters.competencyId ?? ""}
        onChange={(event) => onChange("competencyId", event.target.value || null)}
        disabled={disabled}
      >
        <option value="" className="bg-card text-foreground">All competencies</option>
        {competencies.map((competency) => (
          <option key={competency.competency_id} value={competency.competency_id} className="bg-card text-foreground">
            {competency.name}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="intervention-filter-grade">
        Grade
      </label>
      <select
        id="intervention-filter-grade"
        className={SELECT_STYLE}
        value={filters.gradeId ?? ""}
        onChange={(event) => onChange("gradeId", event.target.value || null)}
        disabled={disabled}
      >
        <option value="" className="bg-card text-foreground">All grades</option>
        {grades.map((grade) => (
          <option key={grade.grade_id} value={grade.grade_id} className="bg-card text-foreground">
            {grade.name}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="intervention-filter-section">
        Section
      </label>
      <select
        id="intervention-filter-section"
        className={SELECT_STYLE}
        value={filters.sectionId ?? ""}
        onChange={(event) => onChange("sectionId", event.target.value || null)}
        disabled={disabled}
      >
        <option value="" className="bg-card text-foreground">All sections</option>
        {sections.map((section) => (
          <option key={section.section_id} value={section.section_id} className="bg-card text-foreground">
            {section.name}
          </option>
        ))}
      </select>

      <p className="ml-auto text-xs text-muted-foreground" role="status">
        Showing <strong className="text-foreground">{cases.length}</strong> case{cases.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}