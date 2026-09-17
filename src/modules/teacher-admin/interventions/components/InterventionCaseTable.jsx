import { BookOpen, User, ChevronRight } from "lucide-react";

import { CaseStatusBadge } from "./CaseStatusBadge";
import { formatScore } from "../utils/intervention-helpers";

/**
 * The prioritized intervention queue.
 *
 * Rows are already server-sorted by severity; score evidence is deterministic
 * and displayed straight from the API.
 *
 * @param {object} props
 * @param {Array<object>} props.cases
 * @param {(interventionId: string) => void} props.onReview
 * @param {boolean} [props.loading]
 * @param {string|null} [props.error]
 */
export function InterventionCaseTable({ cases, onReview, loading = false, error = null }) {
  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error}
      </p>
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
                    <button
                      type="button"
                      onClick={() => onReview(item.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      Review
                      <ChevronRight aria-hidden="true" className="size-3.5" />
                    </button>
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