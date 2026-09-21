"use client";

import { useState } from "react";
import { ChevronDown, Filter, Layers, Plus, Trash2 } from "lucide-react";

import { useFilterPresets } from "../hooks/useFilterPresets";
import { activeFilterCount, advancedFilterCount } from "../utils/intervention-helpers";

// `max-w-full min-w-0` is load-bearing, not decoration: a select is sized by
// its longest option, and a competency name is long enough to push the filter
// row past a 360px phone and take the whole page sideways with it.
const CONTROL_FIT = "max-w-full min-w-0";
const SELECT_STYLE =
  `h-9 ${CONTROL_FIT} rounded-md border border-input bg-card text-foreground px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`;
const DATE_STYLE =
  `h-9 ${CONTROL_FIT} rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`;
const BUTTON_STYLE =
  "inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-60";
const QUIET_BUTTON_STYLE =
  "inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

/**
 * Deterministic filter bar for the intervention queue.
 *
 * The four a teacher reaches for every day stay on screen: severity, status,
 * competency and section. The date range, the attempt and score-drop floors
 * and the saved views sit behind a disclosure, because a row of nine controls
 * reads as a form to fill in rather than a queue to narrow.
 *
 * Grade is deliberately absent. MathSmart is a Grade 6 product, and a control
 * with one option is a question nobody needed to be asked. `grade_id` remains
 * a supported query parameter; only the control is gone.
 *
 * The disclosure carries a count, so a collapsed panel can never hide an
 * applied filter: the badge is the promise that what you cannot see is not
 * secretly narrowing your queue.
 *
 * Every control maps to a documented backend filter or a client-side snapshot
 * of the same keys. None of these decisions are made by Groq.
 *
 * @param {object} props
 * @param {object} props.filters - Current filter state
 * @param {(key: string, value: string|null) => void} props.onChange
 * @param {(next: object) => void} [props.onApply] - Applies a full filter snapshot (presets)
 * @param {() => void} [props.onClear] - Resets every filter to its default
 * @param {Array<object>} [props.competencies]
 * @param {Array<object>} [props.sections]
 * @param {boolean} [props.disabled]
 * @param {Array<object>} [props.cases] - Current visible cases (for the count line)
 * @param {React.RefObject} [props.focusRef] - First control, focused by the "/" shortcut
 */
export function InterventionFilters({
  filters,
  onChange,
  onApply,
  onClear,
  competencies = [],
  sections = [],
  disabled = false,
  cases = [],
  focusRef = null,
}) {
  const { presets, error: presetsError, save, remove } = useFilterPresets();
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [activePreset, setActivePreset] = useState("");
  const [requestedOpen, setRequestedOpen] = useState(null);

  const advanced = advancedFilterCount(filters);
  const anyApplied = activeFilterCount(filters) > 0;
  // Until the teacher says otherwise, the panel is open exactly when something
  // inside it is already applied — which is what a filter set restored from the
  // address, or from a saved view, needs it to do. Derived, so arriving with a
  // date range set never costs a second render to correct.
  const open = requestedOpen === null ? advanced > 0 : requestedOpen;

  const applyPreset = (name) => {
    const preset = presets.find((item) => item.name === name);
    if (!preset) return;
    onApply?.(preset.filters);
    setActivePreset(name);
  };

  const handleChange = (key, value) => {
    setActivePreset("");
    onChange(key, value);
  };

  const handleClear = () => {
    setActivePreset("");
    onClear?.();
  };

  const handleSavePreset = () => {
    save(presetName, filters);
    setActivePreset(presetName.trim());
    setPresetName("");
    setSavingPreset(false);
  };

  const handleRemovePreset = () => {
    remove(activePreset);
    setActivePreset("");
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2" aria-hidden="true">
          <Filter className="size-4 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">Filters</span>
        </div>

        <label className="sr-only" htmlFor="intervention-filter-severity">
          Severity
        </label>
        <select
          id="intervention-filter-severity"
          ref={focusRef}
          className={SELECT_STYLE}
          value={filters.severity ?? ""}
          onChange={(event) => handleChange("severity", event.target.value || null)}
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
          onChange={(event) => handleChange("status", event.target.value || null)}
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
          onChange={(event) => handleChange("competencyId", event.target.value || null)}
          disabled={disabled}
        >
          <option value="" className="bg-card text-foreground">All competencies</option>
          {competencies.map((competency) => (
            <option key={competency.competency_id} value={competency.competency_id} className="bg-card text-foreground">
              {competency.name}
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
          onChange={(event) => handleChange("sectionId", event.target.value || null)}
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

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="intervention-advanced-filters"
          onClick={() => setRequestedOpen(!open)}
          className={QUIET_BUTTON_STYLE}
        >
          <ChevronDown
            aria-hidden="true"
            className={`size-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
          Advanced filters
          {advanced > 0 ? (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-secondary-foreground">
              {advanced}
              <span className="sr-only"> applied</span>
            </span>
          ) : null}
        </button>

        {anyApplied ? (
          <button type="button" onClick={handleClear} className={`${QUIET_BUTTON_STYLE} ml-auto`}>
            <Layers aria-hidden="true" className="size-3.5" />
            Clear filters
          </button>
        ) : null}
      </div>

      {/* Hidden rather than unmounted: an open panel must not reflow the page
          around it, and a half-typed view name should survive being collapsed. */}
      <div
        id="intervention-advanced-filters"
        hidden={!open}
        className="flex flex-wrap items-center gap-3 border-t border-border pt-3"
      >
        <label className="sr-only" htmlFor="intervention-filter-date-from">Opened from</label>
        <input
          id="intervention-filter-date-from"
          type="date"
          className={DATE_STYLE}
          value={filters.dateFrom ?? ""}
          onChange={(event) => handleChange("dateFrom", event.target.value || null)}
          disabled={disabled}
          aria-label="Opened from"
        />

        <span aria-hidden="true" className="text-xs text-muted-foreground">to</span>

        <label className="sr-only" htmlFor="intervention-filter-date-to">Opened to</label>
        <input
          id="intervention-filter-date-to"
          type="date"
          className={DATE_STYLE}
          value={filters.dateTo ?? ""}
          onChange={(event) => handleChange("dateTo", event.target.value || null)}
          disabled={disabled}
          aria-label="Opened to"
        />

        <label className="sr-only" htmlFor="intervention-filter-attempts">Minimum attempts</label>
        <select
          id="intervention-filter-attempts"
          className={SELECT_STYLE}
          value={filters.minAttempts ?? ""}
          onChange={(event) => handleChange("minAttempts", event.target.value || null)}
          disabled={disabled}
        >
          <option value="" className="bg-card text-foreground">Any attempts</option>
          <option value="2" className="bg-card text-foreground">At least 2 attempts</option>
          <option value="3" className="bg-card text-foreground">At least 3 attempts</option>
          <option value="5" className="bg-card text-foreground">At least 5 attempts</option>
        </select>

        <label className="sr-only" htmlFor="intervention-filter-score-drop">Minimum score drop</label>
        <select
          id="intervention-filter-score-drop"
          className={SELECT_STYLE}
          value={filters.minScoreDrop ?? ""}
          onChange={(event) => handleChange("minScoreDrop", event.target.value || null)}
          disabled={disabled}
        >
          <option value="" className="bg-card text-foreground">Any score drop</option>
          <option value="10" className="bg-card text-foreground">Drop of 10 or more</option>
          <option value="20" className="bg-card text-foreground">Drop of 20 or more</option>
          <option value="30" className="bg-card text-foreground">Drop of 30 or more</option>
        </select>

        <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />

        <label className="sr-only" htmlFor="intervention-filter-preset">Saved views</label>
        <select
          id="intervention-filter-preset"
          className={SELECT_STYLE}
          value={activePreset}
          onChange={(event) => applyPreset(event.target.value)}
          disabled={disabled || presets.length === 0}
        >
          <option value="" className="bg-card text-foreground">
            {presets.length === 0 ? "No saved views" : "Apply a saved view"}
          </option>
          {presets.map((preset) => (
            <option key={preset.name} value={preset.name} className="bg-card text-foreground">
              {preset.name}
            </option>
          ))}
        </select>

        {activePreset ? (
          <button
            type="button"
            onClick={handleRemovePreset}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
            Delete view
          </button>
        ) : null}

        {savingPreset ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <input
              type="text"
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              placeholder="Name this view"
              aria-label="Name for this saved view"
              className={`h-9 w-44 ${CONTROL_FIT} rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`}
            />
            <button type="button" onClick={handleSavePreset} className={BUTTON_STYLE}>
              Save
            </button>
            <button
              type="button"
              onClick={() => { setSavingPreset(false); setPresetName(""); }}
              className={BUTTON_STYLE}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setSavingPreset(true)} className={BUTTON_STYLE}>
            <Plus aria-hidden="true" className="size-3.5" />
            Save current view
          </button>
        )}

        {presetsError ? (
          <p role="alert" className="text-xs text-destructive">{presetsError}</p>
        ) : null}
      </div>
    </div>
  );
}
