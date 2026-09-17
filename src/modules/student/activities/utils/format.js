/**
 * Formatting helpers for the Student Activities module.
 *
 * All pure so they can be unit-tested on Node's own runner without a browser.
 */

/** {number} 0–100 -> "72%". Returns null when there is nothing to say. */
export function formatPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${Math.round(value)}%`;
}

/** Best score as a learner reads it, e.g. "82%". */
export function formatBestScore(value) {
  return formatPercent(value);
}

/** "1 point" / "8 points". Returns null when absent. */
export function formatPoints(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const rounded = Math.round(value);
  return `${rounded} ${rounded === 1 ? "point" : "points"}`;
}

/** "About 15 minutes". Returns null when absent, nonsensical, or too small to count. */
export function formatMinutes(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const rounded = Math.round(value);
  if (rounded < 1) return null;
  return `About ${rounded} ${rounded === 1 ? "minute" : "minutes"}`;
}

/** "8 of 10", the answered/total phrasing used in the player header. */
export function formatAnsweredCount(finished, total) {
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
  const safeFinished = Number.isFinite(finished)
    ? Math.min(safeTotal, Math.max(0, Math.round(finished)))
    : 0;
  return { finished: safeFinished, total: safeTotal, text: `${safeFinished} of ${safeTotal}` };
}

/** 0–100 completion; null when total is absent or zero (never divide by zero). */
export function completionPercent(finished, total) {
  if (!Number.isFinite(finished) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  const done = Math.max(0, Math.min(total, completedInt(finished)));
  return Math.round((done / total) * 100);
}

/** Round a value to a whole count, treating negatives as 0. */
function completedInt(value) {
  return Math.max(0, Math.round(value));
}

/** Time spent in the player, e.g. "3 min" or "1 min". */
export function formatTimeSpent(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}