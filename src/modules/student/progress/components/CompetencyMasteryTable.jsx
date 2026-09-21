"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Clock,
  History,
  TrendingUp,
} from "lucide-react";

import { FIELD_IDS } from "../utils/constants.js";

/**
 * One icon per band, and no band borrowing another's.
 *
 * `developing` and `unscored` both used the clock, so the two states that most
 * need telling apart — work in progress, and no work recorded — looked
 * identical to anyone reading the icon rather than the badge colour.
 */
const STATUS_ICONS = {
  mastered: CheckCircle2,
  developing: TrendingUp,
  needs_support: AlertCircle,
  unscored: CircleDashed,
};

/** The id of the row a competency's history toggle reveals. */
function trajectoryRowId(competencyId) {
  return `progress-trajectory-${competencyId}`;
}

export function CompetencyMasteryTable({ competencies = [] }) {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      aria-labelledby="progress-competency-heading"
      className="min-w-0 bg-card rounded-2xl border border-border shadow-xs overflow-hidden"
    >
      {/* Table Header Strip */}
      <div className="p-6 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2
            id="progress-competency-heading"
            className="text-lg font-bold text-foreground font-display"
          >
            Competency Mastery Data
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Comparing diagnostic baseline against real-time mastery after
            targeted interventions
          </p>
        </div>
        <div className="text-xs text-muted-foreground font-medium shrink-0">
          Standard: Grade 6 Mathematics (ARAL Curriculum)
        </div>
      </div>

      {/* Data Table */}
      {competencies.length === 0 ? (
        <div className="p-8 text-center text-xs text-muted-foreground">
          No competency records have been logged yet. Complete activities and
          assessments to view your score trajectory.
        </div>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <table
            id={FIELD_IDS.COMPETENCY_TABLE}
            className="w-full text-left border-collapse text-xs"
          >
            <thead>
              <tr className="bg-muted/50 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
                <th scope="col" className="py-3.5 px-6">
                  Competency
                </th>
                <th scope="col" className="py-3.5 px-4 text-center">
                  Diagnostic
                </th>
                <th scope="col" className="py-3.5 px-4 text-center">
                  Current
                </th>
                <th scope="col" className="py-3.5 px-4 text-center">
                  Growth
                </th>
                <th scope="col" className="py-3.5 px-4 text-center">
                  Status
                </th>
                <th scope="col" className="py-3.5 px-4 text-center">
                  History
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {competencies.map((row) => {
                const isExpanded = expandedId === row.id;
                const hasTrajectory =
                  row.trajectory && row.trajectory.length > 0;
                const panelId = trajectoryRowId(row.id);

                return (
                  <React.Fragment key={row.id}>
                    <tr className="hover:bg-muted/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="font-bold text-foreground text-sm">
                          {row.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {row.code}
                        </div>
                      </td>

                      <td className="py-4 px-4 text-center">
                        <span className="font-mono font-semibold text-foreground text-sm bg-muted px-2.5 py-1 rounded-lg">
                          {row.diagnosticFormatted}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center">
                        <span className="font-mono font-bold text-primary text-sm bg-primary/10 px-2.5 py-1 rounded-lg border border-primary/25">
                          {row.currentFormatted}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center">
                        <span
                          className={`inline-flex items-center text-xs font-bold ${
                            row.growth !== null && row.growth > 0
                              ? "text-primary"
                              : row.growth !== null && row.growth < 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {row.growthFormatted}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center">
                        {(() => {
                          const StatusIcon = STATUS_ICONS[row.status.variant] || Clock;
                          return (
                            <div className="flex flex-col items-center gap-1">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${row.status.colorClass}`}
                              >
                                <StatusIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
                                <span>{row.status.label}</span>
                              </span>
                              {/*
                                How much evidence stands behind the badge. The
                                band itself is the database's verdict and is not
                                recalculated here; a single fortunate attempt
                                simply no longer looks the same as a steady run
                                of six.
                              */}
                              <span className="text-[10px] text-muted-foreground leading-tight">
                                {row.attemptSummary}
                              </span>
                            </div>
                          );
                        })()}
                      </td>

                      <td className="py-4 px-4 text-center">
                        {hasTrajectory ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(row.id)}
                            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium px-2 py-1 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                            aria-expanded={isExpanded}
                            aria-controls={panelId}
                            aria-label={`Toggle score trajectory for ${row.name}`}
                          >
                            <span className="text-[11px]">
                              {row.trajectory.length}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">
                            —
                          </span>
                        )}
                      </td>
                    </tr>

                    {/*
                      Rendered whether or not it is open, and hidden rather than
                      removed, so that the `aria-controls` on the toggle always
                      names a row that exists.
                    */}
                    {hasTrajectory ? (
                      <tr id={panelId} hidden={!isExpanded} className="bg-muted/40">
                        <td colSpan={6} className="py-3 px-8">
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                              <History className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                              <span>Score Timeline &amp; Attempt History</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                              {row.trajectory.map((point, ptIdx) => (
                                <div
                                  key={ptIdx}
                                  className="p-2.5 rounded-xl bg-card border border-border flex items-center justify-between shadow-2xs"
                                >
                                  <div>
                                    <span className="text-xs font-semibold text-foreground block">
                                      {point.label}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {point.dateFormatted}
                                    </span>
                                  </div>
                                  <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                                    {point.scoreFormatted}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
