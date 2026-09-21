/**
 * Activity domain model: canonical API shapes -> the shapes the UI renders.
 *
 * Pure functions so the player and the list can be unit-tested without a
 * browser or a network.
 */

/** Published `question_type` values the activity player knows how to render. */
export const QUESTION_TYPE = Object.freeze({
  MULTIPLE_CHOICE: "multiple_choice",
  NUMBER_INPUT: "number_input",
  FILL_BLANK: "fill_blank",
});

export const SUPPORTED_QUESTION_TYPES = new Set(Object.values(QUESTION_TYPE));

/**
 * `app.path_item_status` as a learner reads it. The same vocabulary as the
 * rest of the student workspace so a locked activity reads exactly like a
 * locked module and never relies on colour alone.
 */
export const PATH_STATUS = Object.freeze({
  locked: Object.freeze({ label: "Opens later", hint: "Keep working through your learning path." }),
  available: Object.freeze({ label: "Ready to start", verb: "Start" }),
  in_progress: Object.freeze({ label: "In progress", verb: "Continue" }),
  completed: Object.freeze({ label: "Finished", verb: "Review" }),
});

export function pathStatus(value) {
  return PATH_STATUS[value] ?? { label: "Ready to start", verb: "Open", hint: null };
}

/**
 * What a card says about an activity the API reports as not startable.
 *
 * `is_ready` is the API's own answer to "would starting this work?", computed
 * beside the refusal the start route raises, so the card and the server cannot
 * disagree. Three published activities had no questions at all, and every one
 * of them offered a learner a Start button that could only end in a 409. The
 * wording names the teacher deliberately: a child who presses something that
 * fails assumes they broke it, and nothing here is their doing.
 */
export const NOT_READY_STATUS = Object.freeze({
  label: "Not ready yet",
  hint: "Your teacher is still adding the questions. It will open here as soon as they finish, and you have not missed anything.",
});

/**
 * Why an activity cannot be started, or `null` when it can.
 *
 * Both reasons close the card, so neither can produce a false invitation, and
 * the order between them is about which sentence helps more. "Opens later"
 * comes first because a learner can act on it — finish the earlier lessons —
 * whereas a locked activity that is also unfinished may well have its
 * questions by the time the path reaches it.
 *
 * @param {{pathStatus: string|null, isReady: boolean}} activity a row from `buildActivityList`
 * @returns {{kind: string, label: string, hint: string}|null}
 */
export function activityGate(activity) {
  if (!activity) return null;

  if (activity.pathStatus === "locked") {
    return { kind: "locked", ...PATH_STATUS.locked };
  }
  if (activity.isReady === false) {
    return { kind: "not_ready", ...NOT_READY_STATUS };
  }
  return null;
}

/**
 * Whether the API says this activity could actually be started.
 *
 * `is_ready` is trusted whenever it is present. A payload from before the
 * field existed falls back to the question count, and a payload carrying
 * neither is treated as ready — the start route still refuses what it must,
 * and hiding every card behind a field an older build never sent would be a
 * worse failure than the one being fixed.
 */
function readsAsReady(entry) {
  if (typeof entry.is_ready === "boolean") return entry.is_ready;
  if (typeof entry.question_count === "number") return entry.question_count > 0;
  return true;
}

/** `app.mastery_band` written out for a Grade 6 learner. */
export const MASTERY_BAND = Object.freeze({
  Mastered: Object.freeze({ label: "Mastered", fill: 3 }),
  Developing: Object.freeze({ label: "Developing", fill: 2 }),
  "Needs Improvement": Object.freeze({ label: "Needs practice", fill: 1 }),
});

export function masteryBand(value) {
  return MASTERY_BAND[value] ?? { label: "Not scored yet", fill: 0 };
}

/** Answer choices arrive as strings, numbers or objects; the UI sees `{key,label}`. */
export function toOptions(choices) {
  if (!Array.isArray(choices)) return [];

  return choices
    .map((choice) => {
      if (choice === null || choice === undefined) return null;

      if (typeof choice === "string" || typeof choice === "number") {
        return { key: String(choice), label: String(choice) };
      }

      const key = choice.key ?? choice.id ?? choice.value ?? null;
      const label = choice.label ?? choice.text ?? choice.value ?? null;

      if (key === null || label === null) return null;

      return { key: String(key), label: String(label) };
    })
    .filter(Boolean);
}

/** Catalogue model: one activity card with the caller's standing. */
export function buildActivityList(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((entry) => {
      if (!entry || typeof entry.id === "undefined") return null;

      const statusFor = pathStatus(entry.path_status);

      return {
        activityId: String(entry.id),
        moduleId: entry.module_id ? String(entry.module_id) : null,
        moduleTitle: entry.module_title ?? null,
        competencyId: entry.competency_id ? String(entry.competency_id) : null,
        competencyName: entry.competency_name ?? null,
        title: entry.title ?? "Practice activity",
        description: entry.description ?? null,
        estimatedMinutes: entry.estimated_minutes ?? null,
        points: entry.points ?? null,
        masteryThreshold: entry.mastery_threshold ?? null,
        pathStatus: entry.path_status ?? null,
        status: statusFor,
        questionCount:
          typeof entry.question_count === "number" ? entry.question_count : null,
        isReady: readsAsReady(entry),
        attemptCount: entry.attempt_count ?? 0,
        bestScore:
          typeof entry.best_score === "number" ? entry.best_score : null,
      };
    })
    .filter(Boolean);
}

/** One published activity with its ordered questions. */
export function toQuestionView(detail) {
  if (!detail || typeof detail.id === "undefined") {
    throw new Error("The activity could not be read from the API.");
  }

  const questions = Array.isArray(detail.questions) ? detail.questions : [];

  return {
    activityId: String(detail.id),
    moduleId: detail.module_id ? String(detail.module_id) : null,
    moduleTitle: detail.module_title ?? null,
    competencyId: detail.competency_id ? String(detail.competency_id) : null,
    competencyName: detail.competency_name ?? null,
    title: detail.title ?? "Practice activity",
    description: detail.description ?? null,
    estimatedMinutes: detail.estimated_minutes ?? null,
    points: detail.points ?? null,
    masteryThreshold: detail.mastery_threshold ?? null,
    pathStatus: detail.path_status ?? null,
    // Carried through to the player so a learner who arrived by a stale link
    // is told the activity is unfinished before an attempt is requested for
    // it, rather than after the start route has refused one.
    questionCount:
      typeof detail.question_count === "number" ? detail.question_count : null,
    isReady: readsAsReady(detail),
    questions: questions.map((question, index) => ({
      id: String(question.id),
      competencyId: question.competency_id ? String(question.competency_id) : null,
      competencyName: question.competency_name ?? null,
      text: question.text ?? "",
      type: question.type ?? QUESTION_TYPE.MULTIPLE_CHOICE,
      options: toOptions(question.choices),
      difficulty: question.difficulty ?? null,
      visualAidDescription: question.visual_aid_description ?? null,
      position: index + 1,
    })),
  };
}

/** A started or resumed attempt. */
export function toAttemptView(attempt) {
  if (!attempt || typeof attempt.attempt_id === "undefined") {
    throw new Error("The attempt could not be started from the API.");
  }

  return {
    attemptId: String(attempt.attempt_id),
    status: attempt.status ?? null,
    attemptNumber: attempt.attempt_number ?? 1,
    savedAnswers: attempt.saved_answers ?? {},
    startedAt: attempt.started_at ?? null,
  };
}

/** A finished attempt's result, shaped for the completion screen. */
export function toOutcomeView(outcome) {
  if (!outcome || typeof outcome.attempt_id === "undefined") {
    throw new Error("Your result could not be read from the API.");
  }

  const accuracy =
    typeof outcome.accuracy === "number" ? outcome.accuracy : null;

  return {
    attemptId: String(outcome.attempt_id),
    score: outcome.score ?? null,
    maxScore: outcome.max_score ?? null,
    accuracy,
    passed: outcome.passed === true,
    attemptNumber: outcome.attempt_number ?? 1,
    masteryBand: outcome.mastery_band ?? null,
    masteryLabel: masteryBand(outcome.mastery_band).label,
    previousCompetencyScore:
      typeof outcome.previous_competency_score === "number"
        ? outcome.previous_competency_score
        : null,
    currentCompetencyScore:
      typeof outcome.current_competency_score === "number"
        ? outcome.current_competency_score
        : null,
    interventionCreated: outcome.intervention_created === true,
    nextAction: outcome.next_action ?? null,
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
 * The backend already answers these precisely — 409 `activity_not_ready` for
 * a published activity with no deliverable questions, 412 `content_locked`
 * for one the learning path has not opened, 404 for one that is not there —
 * and every one of them used to land on the same red "Activity unavailable"
 * panel, which reads as a fault and invites a retry that cannot help. Three
 * of the four are ordinary answers rather than breakages, and are marked as
 * notices so the marking-pen red is kept for something actually wrong.
 *
 * The code is preferred over the status because it is the narrower statement;
 * the status is the fallback for a body that never parsed.
 *
 * @param {{status: number|null, code: string|null}} failure
 * @returns {{kind: string, title: string, isFault: boolean}}
 */
export function startRefusal({ status = null, code = null } = {}) {
  if (code === "activity_not_ready" || code === "empty_activity" || status === 409) {
    return {
      kind: REFUSAL.NOT_READY,
      title: "This activity is not ready yet",
      isFault: false,
    };
  }
  if (code === "content_locked" || status === 412) {
    return { kind: REFUSAL.LOCKED, title: "This activity is not open yet", isFault: false };
  }
  if (status === 404) {
    return {
      kind: REFUSAL.MISSING,
      title: "This activity could not be found",
      isFault: false,
    };
  }
  return { kind: REFUSAL.FAULT, title: "Activity unavailable", isFault: true };
}
