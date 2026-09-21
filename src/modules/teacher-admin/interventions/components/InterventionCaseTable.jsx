import Link from "next/link";
import { BookOpen, User, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

import { CaseStatusBadge } from "./CaseStatusBadge";
import { CaseRowMenu } from "./CaseRowMenu";
import { caseHref, formatScore } from "../utils/intervention-helpers";

const CHECKBOX_STYLE = "size-4 accent-primary";

/**
 * The prioritized intervention queue.
 *
 * Rows are already server-sorted by severity; score evidence is deterministic
 * and displayed straight from the API. Checkboxes feed the bulk action bar;
 * the row menu offers quick lifecycle moves that need no educator-written
 * reason.
 *
 * @param {object} props
 * @param {Array<object>} props.cases
 * @param {object} [props.filters] - The queue to carry into a case, and back out of it
 * @param {(() => void)|null} [props.onRetry] - Re-reads the queue after a failure
 * @param {(interventionId: string, status: "In Progress"|"Resolved") => void} props.onQuickStatus
 * @param {(interventionId: string, selected: boolean) => void} props.onToggleSelected
 * @param {() => void} props.onToggleSelectAll
 * @param {Set<string>} [props.selectedIds]
 * @param {boolean} [props.allSelected]
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.loading]
 * @param {string|null} [props.error]
 */
export function InterventionCaseTable({
  cases,
  filters = null,
  onQuickStatus,
  onToggleSelected,
  onToggleSelectAll,
  selectedIds = new Set(),
  allSelected = false,
  disabled = false,
  loading = false,
  error = null,
  onRetry = null,
}) {
  if (error) {
    // An error replaces the rows rather than sitting above them: the cases
    // that were on screen are no longer known to exist, and leaving them under
    // a warning invites acting on a queue that may have moved on.
    return (
      <div
        role="alert"
        className="space-y-3 rounded-xl border-l-[3px] border-destructive bg-destructive/5 px-4 py-3"
      >
        <div>
          <p className="text-sm font-semibold text-foreground">Could not load intervention cases</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
        {onRetry ? (
          <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={loading}>
            {loading ? "Trying again…" : "Try again"}
          </Button>
        ) : null}
      </div>
    );
  }

  if (!loading && cases.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <BookOpen aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-semibold text-foreground">No intervention cases</p>
        <p className="mt-1 text-sm text-muted-foreground">
          No students need intervention for the current filter. Adjust the filters or check back later.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Intervention cases, highest priority first</caption>
          <thead>
            <tr className="border-b border-border bg-muted text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="w-10 px-2 py-3">
                <label className="sr-only" htmlFor="intervention-select-all">
                  Select all cases
                </label>
                <input
                  id="intervention-select-all"
                  type="checkbox"
                  className={CHECKBOX_STYLE}
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  disabled={disabled || cases.length === 0}
                  title="Select all cases"
                />
              </th>
              <th scope="col" className="px-4 py-3">Priority</th>
              <th scope="col" className="px-4 py-3">Learner</th>
              <th scope="col" className="px-4 py-3">Target competency</th>
              <th scope="col" className="px-4 py-3 text-center">Diagnostic</th>
              <th scope="col" className="px-4 py-3 text-center">Current</th>
              <th scope="col" className="px-4 py-3 text-center">Unsuccessful attempts</th>
              <th scope="col" className="px-4 py-3 text-center">Status</th>
              <th scope="col" className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cases.map((item) => {
              const isHigh = item.severity === "HIGH";
              return (
                <tr
                  key={item.id}
                  className={`transition-colors hover:bg-muted/40 ${isHigh ? "bg-rose-500/5" : ""}`}
                >
                  <td className="px-2 py-3">
                    <label className="sr-only" htmlFor={`intervention-select-${item.id}`}>
                      Select case for {item.student.full_name}
                    </label>
                    <input
                      id={`intervention-select-${item.id}`}
                      type="checkbox"
                      className={CHECKBOX_STYLE}
                      checked={selectedIds.has(item.id)}
                      onChange={(event) => onToggleSelected(item.id, event.target.checked)}
                      disabled={disabled}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <CaseStatusBadge kind="severity" value={item.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <User aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                      <div>
                        <div className="font-semibold text-foreground">{item.student.full_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.student.section_name ? `Section ${item.student.section_name}` : "No section"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{item.competency.name}</div>
                    <div className="text-xs text-muted-foreground">{item.competency.code}</div>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">
                    {formatScore(item.evidence.diagnostic_score)}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums font-semibold text-foreground">
                    {formatScore(item.evidence.current_score)}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-destructive">
                    {item.evidence.unsuccessful_attempts}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <CaseStatusBadge kind="status" value={item.status} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* A link, not a button: the case is a page now, so
                          middle-click, open-in-new-tab and the browser's own
                          back button all work without anything being wired up
                          for them. The queue travels in the address. */}
                      <Link
                        href={caseHref(item.id, filters)}
                        aria-label={`Review the case for ${item.student.full_name}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        Review
                        <ChevronRight aria-hidden="true" className="size-3.5" />
                      </Link>
                      <CaseRowMenu
                        item={item}
                        filters={filters}
                        onQuickStatus={onQuickStatus}
                        disabled={disabled}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {loading ? (
        <p role="status" className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          Updating cases...
        </p>
      ) : null}
    </div>
  );
}