/**
 * What a learner may do with each assessment, and what to call it.
 *
 * The API decides this, not the interface. `availability` is computed in SQL
 * beside the same `app.may_start_reassessment` the start route's own refusal
 * rests on, so the card a learner sees and the answer they get when they press
 * it cannot disagree. Before this existed, every client had to guess from
 * `latest_status`, and a guess that says "Start" over a paper the server will
 * refuse is worse than no button at all.
 *
 * Everything here is a pure mapping. It is where the wording lives, so the
 * wording can be tested without a browser.
 */

/**
 * The five things that can be true, mirroring the API's `availability`.
 *
 * `not_ready` is the API's answer for a paper that exists and is published but
 * could not actually be delivered — no questions, or one of them belonging to
 * a competency still in draft. The server resolves it in preference to
 * `available`, `in_progress` and `reassessment`, because a start request would
 * be refused whatever else is also true; `completed` still wins, since a
 * learner who has already sat the paper has a report to read and the paper's
 * current membership no longer concerns them.
 */
export const AVAILABILITY = Object.freeze({
  AVAILABLE: "available",
  IN_PROGRESS: "in_progress",
  REASSESSMENT: "reassessment",
  COMPLETED: "completed",
  NOT_READY: "not_ready",
});

/**
 * How one availability reads on a card.
 *
 * `canOpen` is the whole point: a completed paper with no retake grant is
 * still shown — a learner should see what they have finished — but it is not
 * offered as something to start.
 *
 * `destination` is where the card's control leads when it leads anywhere.
 * A finished paper leads to its report; an unfinished one leads nowhere at
 * all, which is not the same thing and used to be conflated — anything that
 * could not be opened fell through to the report branch and a not-ready paper
 * would have pointed a learner at a report that does not exist.
 *
 * `reason` is the sentence a closed card owes the learner, and exists only
 * where the state is not self-explanatory.
 */
const PRESENTATION = Object.freeze({
  [AVAILABILITY.AVAILABLE]: {
    label: "Ready to start",
    verb: "Start",
    canOpen: true,
    destination: "player",
    reason: null,
  },
  [AVAILABILITY.IN_PROGRESS]: {
    label: "In progress",
    verb: "Continue",
    canOpen: true,
    destination: "player",
    reason: null,
  },
  [AVAILABILITY.REASSESSMENT]: {
    label: "Retake allowed",
    verb: "Start retake",
    canOpen: true,
    destination: "player",
    reason: null,
  },
  [AVAILABILITY.COMPLETED]: {
    label: "Finished",
    verb: "View report",
    canOpen: false,
    destination: "report",
    reason: null,
  },
  // Never "Ready to start". This card said exactly that over a paper whose
  // start route was already refusing it, and a learner pressed it and was
  // handed a server error for something no action of theirs caused. The
  // wording says who is still working on it and that they have lost nothing.
  [AVAILABILITY.NOT_READY]: {
    label: "Not ready yet",
    verb: "Not ready yet",
    canOpen: false,
    destination: "none",
    reason:
      "Your teacher is still setting this paper up. It will open here as soon as they finish, and you have not missed anything.",
  },
});

// A status this build has never heard of keeps the old behaviour of leading to
// a report when one exists: unknown means unknown, not broken.
const UNKNOWN = Object.freeze({
  label: "Not available",
  verb: "Not available",
  canOpen: false,
  destination: "report",
  reason: null,
});

/**
 * The presentation for one availability value.
 *
 * An unrecognised value is treated as closed rather than open. A future status
 * this build has never heard of is not something to invite a child into.
 *
 * @param {string|null|undefined} availability
 * @returns {{label: string, verb: string, canOpen: boolean, destination: string, reason: string|null}}
 */
export function availabilityPresentation(availability) {
  return PRESENTATION[availability] ?? UNKNOWN;
}

/** The learner-facing name for an assessment type. */
const TYPE_LABEL = Object.freeze({
  diagnostic: "Diagnostic",
  reassessment: "Reassessment",
  unit_quiz: "Unit quiz",
});

/**
 * One catalogue row, normalised for the card that renders it.
 *
 * Defensive about shape rather than trusting the payload: this is a screen a
 * learner opens, and a missing field should cost them a line of text rather
 * than the whole page.
 *
 * @param {object} row
 */
export function catalogueEntry(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const id = row.id ?? row.assessment_id ?? null;
  if (!id) {
    return null;
  }

  const declared = typeof row.availability === "string" ? row.availability : null;
  // The API resolves this precedence itself, but a row carrying `is_ready:
  // false` beside an older availability is still stating what a start request
  // would do, and the card believes that over the label. A finished paper is
  // left as it is: its report does not stop existing because a question was
  // archived out of the paper afterwards.
  const availability =
    row.is_ready === false && declared !== AVAILABILITY.COMPLETED
      ? AVAILABILITY.NOT_READY
      : declared;
  const presentation = availabilityPresentation(availability);
  const totalQuestions = Number(row.total_questions) || 0;
  const durationMinutes = Number(row.duration_minutes) || 0;

  return {
    id: String(id),
    title: typeof row.title === "string" && row.title ? row.title : "Untitled assessment",
    description: typeof row.description === "string" ? row.description : null,
    type: typeof row.type === "string" ? row.type : null,
    typeLabel: TYPE_LABEL[row.type] ?? "Assessment",
    totalQuestions,
    durationMinutes,
    availability,
    label: presentation.label,
    verb: presentation.verb,
    canOpen: presentation.canOpen,
    reason: presentation.reason,
    latestAttemptId: row.latest_attempt_id ? String(row.latest_attempt_id) : null,
    // Where the card's action goes. A finished paper leads to its report; an
    // open one leads to the player. A finished paper whose attempt id never
    // came back has nowhere to lead, and says so instead of linking nowhere.
    href:
      presentation.destination === "player"
        ? `/student/assessments/${id}`
        : presentation.destination === "report" && row.latest_attempt_id
          ? `/student/assessments/${id}?attempt=${encodeURIComponent(row.latest_attempt_id)}`
          : null,
  };
}

/**
 * The catalogue, in the order a learner should meet it.
 *
 * Diagnostics first, because nothing else in the system means anything until
 * one has been sat; then whatever is open; then what is already finished. A
 * stable tiebreak on title keeps the list from reshuffling between reloads.
 *
 * @param {Array<object>|null|undefined} rows
 */
export function buildCatalogue(rows) {
  const entries = (Array.isArray(rows) ? rows : []).map(catalogueEntry).filter(Boolean);

  const rank = (entry) => {
    if (entry.type === "diagnostic") return 0;
    if (entry.canOpen) return 1;
    return 2;
  };

  return entries.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}

/**
 * The preview shape the player expects, built from one catalogue or detail row.
 *
 * The player was written for the diagnostic and reads `diagnostic_status`,
 * which is genuinely a diagnostic idea. Rather than teach every branch of it a
 * second vocabulary, the availability the API now returns is translated into
 * the one it already understands — the states are the same states, and the
 * branches that follow are the ones that have been in use all along.
 *
 * @param {object} row a catalogue or detail row
 * @param {object|null} status the learner's diagnostic standing, when relevant
 */
export function previewFromSummary(row, status = null) {
  const entry = catalogueEntry(row);
  if (!entry) {
    return null;
  }

  const availability = entry.availability;
  const completed =
    availability === AVAILABILITY.COMPLETED || availability === AVAILABILITY.REASSESSMENT;

  return {
    assessment_id: entry.id,
    title: entry.title,
    // Carried into the player so a learner who typed the URL, or followed a
    // link saved before the paper lost a question, is told what is wrong
    // before the intro offers them a button that cannot work.
    is_ready: entry.availability !== AVAILABILITY.NOT_READY,
    type: entry.type,
    total_questions: entry.totalQuestions,
    time_limit_minutes: entry.durationMinutes || 60,
    latest_attempt_id: entry.latestAttemptId ?? status?.latest_attempt_id ?? null,
    latest_status: row?.latest_status ?? null,
    diagnostic_status:
      availability === AVAILABILITY.IN_PROGRESS
        ? "in_progress"
        : completed
          ? "completed"
          : "not_started",
    reassessment_eligible: availability === AVAILABILITY.REASSESSMENT,
    // Only a diagnostic has a teacher's written reason to show, and it comes
    // from the standing endpoint rather than the catalogue.
    reassessment_reason: status?.reassessment_reason ?? null,
  };
}

/** The kinds of refusal the player has its own screen for. */
export const REFUSAL = Object.freeze({
  NOT_READY: "not_ready",
  LOCKED: "locked",
  MISSING: "missing",
  FAULT: "fault",
});

/**
 * Which refusal an API failure is, so the player can show it as itself.
 *
 * The backend answers these precisely — 409 `assessment_not_ready` for a
 * published paper it cannot deliver, 412 for a sitting the learner is not
 * entitled to, 404 for one that is not there — and all of them used to land
 * under the same "Something went wrong" heading, which tells a child that
 * MathSmart broke. Three of the four are the server answering honestly, so
 * they are marked as notices and the red is kept for a real fault.
 *
 * The code is preferred over the status because it is the narrower statement;
 * the status is what is left when a reply carried no body to read.
 *
 * @param {{status: number|null, code: string|null}} failure
 * @returns {{kind: string, title: string, isFault: boolean}}
 */
export function startRefusal({ status = null, code = null } = {}) {
  if (code === "assessment_not_ready" || status === 409) {
    return {
      kind: REFUSAL.NOT_READY,
      title: "This assessment is not ready yet",
      isFault: false,
    };
  }
  if (code === "reassessment_not_authorized" || code === "content_locked" || status === 412) {
    return {
      kind: REFUSAL.LOCKED,
      title: "This assessment is not open to you yet",
      isFault: false,
    };
  }
  if (status === 404) {
    return {
      kind: REFUSAL.MISSING,
      title: "This assessment could not be found",
      isFault: false,
    };
  }
  return { kind: REFUSAL.FAULT, title: "Something went wrong", isFault: true };
}
