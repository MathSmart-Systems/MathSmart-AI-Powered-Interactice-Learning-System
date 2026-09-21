/**
 * What the advisory call is allowed to know, and what it is allowed to say.
 *
 * The evidence is built from the deterministic progress response and nothing
 * else. It carries no learner name, no learner id, no email and no free text
 * about a person — only the numbers for one competency, which is all the
 * `/ai/teacher-insight` contract has fields for.
 *
 * The reply is read defensively: a note with no learning gap is treated as
 * nothing at all.
 */

/** The backend caps both evidence arrays at twenty items. */
const MAX_EVIDENCE_ITEMS = 20;

/** The contract's own ceiling for the free-text context. */
const MAX_CONTEXT = 2000;

/**
 * A finite number in 0..100, or null. The API rejects anything else.
 *
 * `null` is checked before the cast on purpose: `Number(null)` is `0`, which
 * would turn "not attempted yet" into "scored zero" — a different claim about
 * a learner, and the wrong one.
 */
function score(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < 0 || number > 100) return null;
  return number;
}

/** A whole count of zero or more, or null. Same null-before-cast reasoning. */
function count(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.trunc(number);
}

/**
 * The competency an insight is worth asking about.
 *
 * The one the learner is furthest from mastering, measured by current score,
 * because that is where a teacher's attention is most useful. Competencies
 * with no current score yet are skipped: there is nothing to explain.
 *
 * @param {object|null|undefined} progress - The deterministic progress payload
 * @returns {object|null}
 */
export function weakestCompetency(progress) {
  const list = Array.isArray(progress?.competencies) ? progress.competencies : [];
  const scored = list.filter((item) => score(item?.current_score) !== null);
  if (scored.length === 0) return null;

  return scored.reduce((lowest, item) =>
    score(item.current_score) < score(lowest.current_score) ? item : lowest,
  );
}

/**
 * Builds the bounded, identity-free evidence for one competency.
 *
 * Returns null when there is nothing worth sending — no competency, or no
 * score on it — so the caller can stay quiet rather than ask Groq to comment
 * on an empty record.
 *
 * @param {object|null|undefined} progress - The deterministic progress payload
 * @param {object|null|undefined} competency - The competency to ask about
 * @returns {object|null}
 */
export function buildInsightEvidence(progress, competency) {
  if (!competency?.competency_id) return null;

  const currentScore = score(competency.current_score);
  const diagnosticScore = score(competency.diagnostic_score);
  if (currentScore === null && diagnosticScore === null) return null;

  // Titles of work already completed, capped at the contract's limit. These
  // are module names, never learner names.
  const completedModules = (Array.isArray(progress?.recent_activity) ? progress.recent_activity : [])
    .map((item) => (typeof item?.title === "string" ? item.title.trim() : ""))
    .filter(Boolean)
    .slice(0, MAX_EVIDENCE_ITEMS);

  // A sentence about the work, not about the person. The competency name is
  // curriculum vocabulary; the adapter drops it anyway, because its key
  // contains "name".
  const context = [
    competency.competency_code ? `Competency ${competency.competency_code}.` : null,
    diagnosticScore !== null ? `Diagnostic ${diagnosticScore}%.` : null,
    currentScore !== null ? `Current ${currentScore}%.` : null,
    competency.mastery_band ? `Mastery band: ${competency.mastery_band}.` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, MAX_CONTEXT);

  return {
    competencyId: competency.competency_id,
    diagnosticScore,
    currentScore,
    attemptCount: count(competency.attempt_count),
    unsuccessfulAttempts: count(competency.unsuccessful_attempts),
    completedModules,
    displayContext: context || null,
  };
}

/** The server's own ceilings. Read as guards, never as a place to trim text. */
export const NOTE_LIMITS = { evidence: 2, actions: 3 };

function line(value) {
  return typeof value === "string" ? value.trim() : "";
}

function lines(value, limit) {
  return (Array.isArray(value) ? value : []).map(line).filter(Boolean).slice(0, limit);
}

/**
 * Reads one teaching note, or null when nothing usable came back.
 *
 * The server shapes and bounds the note — a gap, up to two pieces of evidence,
 * up to three actions and one next check, 150 words in all, no markup — so
 * this only picks the fields out. Provider, model and time are not part of
 * the reply and are not read: a teacher is told the note is an advisory AI
 * suggestion, and that is all.
 *
 * @param {object|null|undefined} result - The service reply
 * @returns {{gap: string, evidence: string[], actions: string[], nextCheck: string|null}|null}
 */
export function readInsight(result) {
  if (!result?.ok || !result.data || typeof result.data !== "object") return null;

  const data = result.data;
  const gap = line(data.insight_summary);
  if (!gap) return null;

  return {
    gap,
    evidence: lines(data.evidence, NOTE_LIMITS.evidence),
    actions: lines(data.recommended_actions, NOTE_LIMITS.actions),
    nextCheck: line(data.next_check) || null,
  };
}

/** Said in a toast when "Ask again" fails and the previous note stays. */
export const REFRESH_FAILED =
  "A new note could not be prepared. Your previous note is still shown.";

/**
 * The panel's state once a request has answered.
 *
 * A new note replaces the old one only when it arrived and could be read.
 * When "Ask again" fails, the note on screen stays exactly as it was and the
 * failure is reported separately, so asking again can never cost a teacher
 * the note they were reading. With no note to keep, the reason is shown in
 * its place.
 *
 * @param {{insight: object|null}} previous - The state before the request
 * @param {object|null|undefined} result - The service reply
 * @returns {{loading: false, insight: object|null, reason: string|null, failure: string|null}}
 */
export function settleInsight(previous, result) {
  const insight = readInsight(result);
  if (insight) return { loading: false, insight, reason: null, failure: null };

  if (previous?.insight) {
    return { loading: false, insight: previous.insight, reason: null, failure: REFRESH_FAILED };
  }
  // A reply that answered but held no readable note is, to a teacher, the
  // same as no reply.
  const failed = result && !result.ok ? result : { ok: false, status: null, code: "unreadable" };
  return { loading: false, insight: null, reason: insightUnavailableReason(failed), failure: null };
}

/**
 * What to tell a teacher when no advisory text arrived.
 *
 * Every Groq-side failure answers with the same 503, so this does not invent a
 * distinction the API cannot make. A missing session or an unconfigured API is
 * a different thing and says so.
 *
 * @param {object|null|undefined} result - The service reply
 * @returns {string|null} null when the call succeeded
 */
export function insightUnavailableReason(result) {
  if (!result || result.ok) return null;

  if (result.code === "unconfigured") {
    return "The MathSmart API address is not configured, so advisory notes cannot be requested.";
  }
  if (result.code === "no_session") {
    return "Your session has ended. Sign in again to request an advisory note.";
  }
  if (result.status === 403) {
    return "Advisory notes are available to Teacher/Administrator accounts.";
  }
  return "Advisory notes are unavailable right now. The learner's progress below is unaffected.";
}
