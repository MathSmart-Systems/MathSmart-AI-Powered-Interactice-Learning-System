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
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
      {/* Table Header Strip */}
      <div className="p-6 border-b border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-display">
            Competency Mastery Data
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Comparing diagnostic baseline against real-time mastery after targeted interventions
          </p>
        </div>
        <div className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/60 px-2.5 py-1 rounded-lg">
          Standard: Grade 6 Mathematics (DepEd MATATAG)
        </div>
      </div>

      {/* Data Table */}
      {competencies.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
          No competency records have been logged yet. Complete activities and assessments to view your score trajectory.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table
            id={FIELD_IDS.COMPETENCY_TABLE}
            className="w-full text-left border-collapse text-xs"
          >
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th scope="col" className="py-3.5 px-6">Competency</th>
                <th scope="col" className="py-3.5 px-4 text-center">Diagnostic</th>
                <th scope="col" className="py-3.5 px-4 text-center">Current</th>
                <th scope="col" className="py-3.5 px-4 text-center">Growth</th>
                <th scope="col" className="py-3.5 px-4 text-center">Status</th>
                <th scope="col" className="py-3.5 px-4 text-center">History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {competencies.map((row) => {
                const isExpanded = expandedId === row.id;
                const hasTrajectory = row.trajectory && row.trajectory.length > 0;

                return (
                  <React.Fragment key={row.id}>
                    <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                          {row.name}
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                          {row.code}
                        </div>
                      </td>

                      <td className="py-4 px-4 text-center">
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 text-sm bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                          {row.diagnosticFormatted}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center">
                        <span className="font-mono font-bold text-indigo-900 dark:text-indigo-200 text-sm bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-900/60">
                          {row.currentFormatted}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center">
                        <span
                          className={`inline-flex items-center text-xs font-bold ${
                            row.growth !== null && row.growth > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : row.growth !== null && row.growth < 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-slate-500 dark:text-slate-400"
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
                            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 font-medium px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            aria-expanded={isExpanded}
                            aria-label={`Toggle score trajectory for ${row.name}`}
                          >
                            <span className="text-[11px]">{row.trajectory.length}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700 text-xs">—</span>
                        )}
                      </td>
                    </tr>

                    {/* Trajectory Timeline Accordion */}
                    {isExpanded && hasTrajectory && (
                      <tr className="bg-slate-50/40 dark:bg-slate-800/30">
                        <td colSpan={6} className="py-3 px-8">
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                              <History className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                              <span>Score Timeline & Attempt History</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                              {row.trajectory.map((point, ptIdx) => (
                                <div
                                  key={ptIdx}
                                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-2xs"
                                >
                                  <div>
                                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
                                      {point.label}
                                    </span>
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                      {point.dateFormatted}
                                    </span>
                                  </div>
                                  <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md">
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
