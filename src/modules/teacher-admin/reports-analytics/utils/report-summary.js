/**
 * The optional AI summary of a report: reading it, and keeping it.
 *
 * The server shapes and bounds the summary — an overview, up to two patterns,
 * up to three actions, 150 words in all, no markup — so this only picks the
 * fields out. A new summary replaces the one on screen only when it arrives;
 * a failed request leaves the previous one exactly as it was and says so
 * separately. A summary is tied to the filters it was asked for, so changing
 * the report never leaves a summary of different numbers on screen.
 */

const LIMITS = { patterns: 2, actions: 3 };

function line(value) {
  return typeof value === "string" ? value.trim() : "";
}

function lines(value, limit) {
  return (Array.isArray(value) ? value : []).map(line).filter(Boolean).slice(0, limit);
}

/**
 * @param {{ok?: boolean, data?: object}|null|undefined} result
 * @returns {{overview: string, patterns: string[], actions: string[]}|null}
 */
export function readSummary(result) {
  if (!result?.ok || !result.data || typeof result.data !== "object") return null;
  const overview = line(result.data.overview);
  if (!overview) return null;
  return {
    overview,
    patterns: lines(result.data.patterns, LIMITS.patterns),
    actions: lines(result.data.actions, LIMITS.actions),
  };
}

export const SUMMARY_REFRESH_FAILED =
  "A new summary could not be prepared. Your previous summary is still shown.";

/** Why no summary arrived, in a teacher's words. */
export function summaryUnavailableReason(result) {
  if (!result || result.ok) return null;
  if (result.code === "nothing_to_summarise") {
    return "There is nothing in this report to summarise yet.";
  }
  if (result.code === "no_session" || result.status === 401) {
    return "Your session has ended. Sign in again to ask for a summary.";
  }
  if (result.status === 403) {
    return "Summaries are available to Teacher/Administrator accounts.";
  }
  return "AI summaries are unavailable right now. The report above is complete without one.";
}

/**
 * The panel's state once a request has answered.
 *
 * @param {{summary: object|null}} previous
 * @param {object|null|undefined} result
 */
export function settleSummary(previous, result) {
  const summary = readSummary(result);
  if (summary) return { loading: false, summary, reason: null, failure: null };
  if (previous?.summary) {
    return { loading: false, summary: previous.summary, reason: null, failure: SUMMARY_REFRESH_FAILED };
  }
  const failed = result && !result.ok ? result : { ok: false, status: null, code: "unreadable" };
  return { loading: false, summary: null, reason: summaryUnavailableReason(failed), failure: null };
}
