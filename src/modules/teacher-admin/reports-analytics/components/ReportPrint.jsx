"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { showCount } from "../utils/report-model.js";

const subscribe = () => () => {};

/**
 * The report as the printer sees it.
 *
 * The global print stylesheet shows only `.mathsmart-print-host` and hides the
 * whole app shell, so this is rendered straight into the document body. It is
 * the deterministic report only, as plain tables in black on white: no
 * filters, no buttons and no AI summary. It is always mounted and never seen
 * on screen, so printing needs no state and always prints what is showing.
 */
export function ReportPrint({ model, scope }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted) return null;

  const { summary, competencies, watchList, mostMissed, interventions, activity } = model;

  return createPortal(
    <div className="mathsmart-print-host text-sm text-neutral-900" aria-hidden="true">
      <header className="border-b-2 border-neutral-900 pb-2">
        <h1 className="font-display text-xl font-bold">MathSmart report: Grade 6 Mathematics</h1>
        <p className="mt-1 text-xs">{scope}</p>
        <p className="text-xs">Printed {new Date().toLocaleString("en-PH")}</p>
      </header>

      <table className="mt-3 w-full border-collapse text-xs">
        <tbody>
          <tr><th className="py-0.5 text-left">Students</th><td>{showCount(summary.learners)}</td></tr>
          <tr><th className="py-0.5 text-left">Diagnostic done</th><td>{showCount(summary.diagnosticCompleted)}</td></tr>
          <tr><th className="py-0.5 text-left">Current average</th><td>{summary.averageCurrent} (diagnostic {summary.averageDiagnostic}, change {summary.growth})</td></tr>
          <tr><th className="py-0.5 text-left">Needs support</th><td>{showCount(summary.needsSupport)}</td></tr>
          <tr><th className="py-0.5 text-left">Interventions</th><td>{showCount(interventions.needsIntervention)} waiting, {showCount(interventions.inProgress)} in progress, {showCount(interventions.resolved)} resolved</td></tr>
          <tr><th className="py-0.5 text-left">Practice</th><td>{showCount(activity.activityAttempts)} attempts, average {activity.activityAverage}</td></tr>
        </tbody>
      </table>

      <h2 className="mt-4 font-bold">Competency mastery</h2>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-neutral-500 text-left">
            <th className="py-1">Competency</th><th>Students</th><th>Mastered</th><th>Developing</th><th>Needs improvement</th><th>Average</th><th>Change</th>
          </tr>
        </thead>
        <tbody>
          {competencies.all.map((row) => (
            <tr key={row.id} className="border-b border-neutral-300">
              <td className="py-1">{row.code ? `${row.code} ` : ""}{row.name}</td>
              <td>{row.tracked}</td><td>{row.bands.mastered}</td><td>{row.bands.developing}</td><td>{row.bands.needsImprovement}</td><td>{row.average}</td><td>{row.growth}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {mostMissed.length > 0 ? (
        <>
          <h2 className="mt-4 font-bold">Most-missed questions</h2>
          <ol className="list-decimal pl-5 text-xs">
            {mostMissed.map((row) => (
              <li key={row.id}>{row.prompt} ({row.incorrect} of {row.answered} wrong)</li>
            ))}
          </ol>
        </>
      ) : null}

      <h2 className="mt-4 font-bold">Students needing support ({watchList.total})</h2>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-neutral-500 text-left">
            <th className="py-1">Student</th><th>Learner ID</th><th>Section</th><th>Diagnostic</th><th>Current</th><th>Open cases</th>
          </tr>
        </thead>
        <tbody>
          {watchList.rows.map((row) => (
            <tr key={row.id} className="border-b border-neutral-300">
              <td className="py-1">{row.name}</td><td>{row.learnerId}</td><td>{row.section ?? "—"}</td><td>{row.diagnostic}</td><td>{row.current}</td><td>{row.openCases}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {watchList.total > watchList.rows.length ? (
        <p className="mt-1 text-xs">This page lists {watchList.rows.length} of {watchList.total}. Export the CSV for everyone.</p>
      ) : null}
    </div>,
    document.body,
  );
}
