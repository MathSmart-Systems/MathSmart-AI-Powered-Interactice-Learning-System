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