"use client";

import { createPortal } from "react-dom";

import { formatDate, formatScore } from "../utils/intervention-helpers";

function Stat({ label, value }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-neutral-900">{value}</dd>
    </div>
  );
}

/**
 * The browser-native print host for intervention reports.
 *
 * Rendered into document.body (outside any dialog portal) so the global print
 * stylesheet can hide the whole app shell and show only this pane. The browser
 * print dialog produces the PDF ("Save as PDF"). The content is deterministic
 * evidence only — no Groq text is ever printed — and the pane holds nothing
 * interactive, so it is purely a print target.
 *
 * @param {object} props
 * @param {object|null} props.report
 * @param {"" | "case" | "history"} props.report.kind
 * @param {object} props.report.student
 * @param {object|null} props.report.competency
 * @param {Array<object>} props.report.cases
 * @param {string} props.report.title
 */
export function ReportPrintPane({ report }) {
  if (!report || typeof document === "undefined") return null;

  const { kind, student = {}, competency = null, cases = [], title } = report;
  const single = kind === "case" ? cases[0] : null;
  const primary = competency ?? single?.competency ?? {};

  return createPortal(
    <div className="mathsmart-print-host text-neutral-900" aria-hidden="true">
      <header className="border-b-2 border-neutral-900 pb-3">
        <h1 className="font-display text-xl font-bold">{title}</h1>
        <p className="mt-1 text-xs">
          Generated {formatDate(new Date().toISOString())} · MathSmart teacher interventions
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="font-semibold">Learner</dt>
            <dd>{student.full_name ?? "Unknown learner"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">Learner ID</dt>
            <dd>{student.learner_id ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">Section</dt>
            <dd>{student.section_name ? `Section ${student.section_name}` : "Unassigned"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold">Competency</dt>
            <dd>
              {primary.name ?? "Competency"}{primary.code ? ` (${primary.code})` : ""}
            </dd>
          </div>
        </dl>
      </header>

      {single ? (
        <section className="mt-4">
          <div className="rounded border border-neutral-400 p-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Stat label="Severity" value={single.severity ?? "—"} />
              <Stat label="Status" value={single.status ?? "—"} />
              <Stat label="Intervention type" value={single.intervention_type ?? "—"} />
              <Stat label="Recorded" value={formatDate(single.recorded_at)} />
              <Stat label="Opened" value={formatDate(single.created_at)} />
              <Stat label="Resolved" value={formatDate(single.resolved_at)} />
            </div>

            <div className="mt-3 grid grid-cols-4 gap-3 border-t border-neutral-300 pt-3">
              <Stat label="Diagnostic baseline" value={formatScore(single.evidence?.diagnostic_score)} />
              <Stat label="Current score" value={formatScore(single.evidence?.current_score)} />
              <Stat label="Attempts" value={single.evidence?.attempt_count ?? 0} />
              <Stat label="Unsuccessful" value={single.evidence?.unsuccessful_attempts ?? 0} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-6">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider">Incorrect-answer patterns</h2>
              {Array.isArray(single.incorrect_patterns) && single.incorrect_patterns.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {single.incorrect_patterns.map((pattern, index) => (
                    <li key={index} className="leading-relaxed">{pattern}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-neutral-600">None recorded.</p>
              )}
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider">Modules attempted</h2>
              {Array.isArray(single.modules_attempted) && single.modules_attempted.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {single.modules_attempted.map((module, index) => (
                    <li key={index} className="leading-relaxed">{module}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-neutral-600">None recorded.</p>
              )}
            </div>
          </div>

          {single.educator_notes ? (
            <div className="mt-4">
              <h2 className="text-xs font-bold uppercase tracking-wider">Educator notes</h2>
              <p className="mt-1 text-sm leading-relaxed">{single.educator_notes}</p>
            </div>
          ) : null}
          {single.reopen_reason ? (
            <div className="mt-4">
              <h2 className="text-xs font-bold uppercase tracking-wider">Reopen reason</h2>
              <p className="mt-1 text-sm leading-relaxed">{single.reopen_reason}</p>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="mt-4">
          <h2 className="text-xs font-bold uppercase tracking-wider">
            Cases ({cases.length})
          </h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-900 text-left">
                <th className="py-1 pr-2 font-semibold">Competency</th>
                <th className="py-1 pr-2 font-semibold">Severity</th>
                <th className="py-1 pr-2 font-semibold">Status</th>
                <th className="py-1 pr-2 font-semibold">Diagnostic</th>
                <th className="py-1 pr-2 font-semibold">Current</th>
                <th className="py-1 pr-2 font-semibold">Type</th>
                <th className="py-1 font-semibold">Opened</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((item) => (
                <tr key={item?.id ?? `${item?.created_at}-${item?.competency?.id}`} className="border-b border-neutral-300">
                  <td className="py-1 pr-2">
                    {item?.competency?.name ?? "Competency"}
                    {item?.competency?.code ? ` (${item.competency.code})` : ""}
                  </td>
                  <td className="py-1 pr-2">{item?.severity ?? "—"}</td>
                  <td className="py-1 pr-2">{item?.status ?? "—"}</td>
                  <td className="py-1 pr-2 tabular-nums">{formatScore(item?.evidence?.diagnostic_score)}</td>
                  <td className="py-1 pr-2 tabular-nums">{formatScore(item?.evidence?.current_score)}</td>
                  <td className="py-1 pr-2">{item?.intervention_type ?? "—"}</td>
                  <td className="py-1 tabular-nums">{formatDate(item?.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="mt-6 border-t border-neutral-300 pt-2 text-[10px] text-neutral-500">
        Deterministic intervention record only. Advisory AI text is never included in this report.
      </footer>
    </div>,
    document.body
  );
}