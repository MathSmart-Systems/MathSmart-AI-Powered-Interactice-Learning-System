"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, History } from "lucide-react";

import { FIELD_IDS } from "../utils/constants.js";

export function CompetencyMasteryTable({ competencies = [] }) {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="min-w-0 bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
      {/* Table Header Strip */}
      <div className="p-6 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground font-display">
            Competency Mastery Data
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Comparing diagnostic baseline against real-time mastery after
            targeted interventions
          </p>
        </div>
        <div className="text-[11px] font-semibold text-primary bg-primary/8 border border-primary/20 px-2.5 py-1 rounded-lg">
          Standard: Grade 6 Mathematics (DepEd MATATAG)
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
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${row.status.colorClass}`}
                        >
                          {row.status.label}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center">
                        {hasTrajectory ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(row.id)}
                            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium px-2 py-1 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                            aria-expanded={isExpanded}
                            aria-label={`Toggle score trajectory for ${row.name}`}
                          >
                            <span className="text-[11px]">
                              {row.trajectory.length}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">
                            —
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* Trajectory Timeline Accordion */}
                    {isExpanded && hasTrajectory && (
                      <tr className="bg-muted/40">
                        <td colSpan={6} className="py-3 px-8">
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                              <History className="w-3.5 h-3.5 text-primary" />
                              <span>Score Timeline & Attempt History</span>
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
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
