/**
 * Diagnostic assessment service.
 *
 * Speaks the canonical MathSmart REST contract in `docs/API_ROUTES.md` section 5.
 * The singular routes this module used during F2 Phase 0-2 (`/assessment/questions`,
 * `/assessment/submit`, `/assessment/status/{student_id}`) are retired by section 17
 * of that document and are not called anywhere here.
 *
 * No student identifier is ever sent from the browser. The backend derives the
 * caller from the verified `sub` claim on the access token, so ownership is a
 * server-side decision. `student_id` is only ever read back from the API.
 */

import diagnosticMock from "@/data/diagnostic.mock.json";
import submitMock from "@/data/submit.mock.json";
import { getApiUrl, USE_MOCK } from "@/config/api";
import { createClient } from "@/lib/supabase/client";

/** `mastery_band` vocabulary from the canonical enum table. */
export const MASTERY_BAND = Object.freeze({
  MASTERED: "Mastered",
  DEVELOPING: "Developing",
  NEEDS_IMPROVEMENT: "Needs Improvement",
});

/** `question_type` values the diagnostic UI can currently render. */
const SUPPORTED_QUESTION_TYPE = "multiple_choice";

/** Error carrying a message that is safe to show a learner. */
export class AssessmentError extends Error {
  constructor(message, { status = null, code = null } = {}) {
    super(message);
    this.name = "AssessmentError";
    this.status = status;
    this.code = code;
  }
}

const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

/** Idempotency keys must survive a retry, so the caller owns the value. */
export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `diag-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fallbackMessage(status) {
  switch (status) {
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You do not have access to this assessment.";
    case 404:
      return "The diagnostic assessment is not available yet.";
    case 409:
      return "This assessment has already been submitted.";
    case 412:
      return "You are not eligible to take this assessment right now.";
    case 422:
      return "Some answers could not be accepted. Please review and try again.";
    default:
      return "Something went wrong while loading your assessment. Please try again.";
  }
}

/**
 * Reads the current access token so it can be forwarded to FastAPI.
 *
 * This is a transport concern, not an authorization one: nothing here trusts the
 * token's contents. The backend verifies the signature and derives the actor,
 * and the route is already gated by the workspace layout and the session proxy.
 */
async function accessToken() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data?.session?.access_token) {
    throw new AssessmentError("Your session has expired. Please sign in again.", {
      status: 401,
    });
  }

  return data.session.access_token;
}

async function request(path, { method = "GET", body, idempotencyKey } = {}) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${await accessToken()}`,
  };

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  let response;

  try {
    response = await fetch(getApiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AssessmentError(
      "We could not reach MathSmart. Check your connection and try again.",
    );
  }

  // A body is optional on some responses, and an error page may not be JSON.
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AssessmentError(
      payload?.error?.message || fallbackMessage(response.status),
      { status: response.status, code: payload?.error?.code ?? null },
    );
  }

  return payload?.data ?? null;
}

/**
 * Answer choices reach us either as plain strings (the fixture) or as objects
 * (the API). The UI only ever sees `{ key, label }`.
 */
function toOptions(choices) {
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

/** Canonical question delivery shape -> the domain-grouped shape the UI renders. */
function toDiagnosticView(attempt) {
  const questions = Array.isArray(attempt?.questions) ? attempt.questions : [];
  const groups = new Map();

  for (const question of questions) {
    // Competency is the canonical grouping key; its name is the learner-facing
    // domain label the F2 UI shows.
    const competencyId = question?.competency_id ?? "uncategorised";

    if (!groups.has(competencyId)) {
      groups.set(competencyId, {
        domain: question?.competency_name ?? "General",
        competency_id: competencyId,
        questions: [],
      });
    }

    const group = groups.get(competencyId);

    group.questions.push({
      question_id: question?.id,
      question_text: question?.text ?? "",
      question_type: question?.type ?? SUPPORTED_QUESTION_TYPE,
      // Canonical calls these `choices`. Types without choices (number_input,
      // fill_blank) normalize to an empty list, and the UI says so rather than
      // rendering a question that cannot be answered.
      options: toOptions(question?.choices),
      order_index: group.questions.length + 1,
    });
  }

  const domains = [...groups.values()];

  return {
    attempt_id: attempt?.attempt_id ?? null,
    total_questions: attempt?.assessment?.total_questions ?? questions.length,
    time_limit_minutes: attempt?.assessment?.duration_minutes ?? 60,
    domains,
    // Present when an in-progress attempt is resumed, so the clock can pick up
    // where it left off instead of restarting.
    started_at: attempt?.started_at ?? null,
    saved_answers: attempt?.saved_answers ?? {},
  };
}

function bandFor(value) {
  const band = String(value ?? "").trim().toLowerCase();

  if (band === "mastered") return MASTERY_BAND.MASTERED;
  if (band === "developing") return MASTERY_BAND.DEVELOPING;
  if (band === "needs improvement") return MASTERY_BAND.NEEDS_IMPROVEMENT;

  return null;
}

/** Canonical scored-attempt shape -> the report shape the UI renders. */
function toReportView(result) {
  const competencies = Array.isArray(result?.competency_results)
    ? result.competency_results
    : [];

  const totalScore = competencies.reduce(
    (sum, entry) => sum + (Number(entry?.raw_score) || 0),
    0,
  );
  const maxScore = competencies.reduce(
    (sum, entry) => sum + (Number(entry?.max_score) || 0),
    0,
  );

  const percentage =
    typeof result?.overall_score === "number"
      ? result.overall_score
      : maxScore > 0
        ? Math.round((totalScore / maxScore) * 1000) / 10
        : 0;

  return {
    attempt_id: result?.attempt_id ?? null,
    status: result?.status ?? null,
    total_score: totalScore,
    max_score: maxScore,
    percentage,
    domain_scores: competencies.map((entry) => {
      const band = bandFor(entry?.mastery_band);

      return {
        domain: entry?.competency_name ?? "Competency",
        competency_id: entry?.competency_id ?? null,
        score: Number(entry?.raw_score) || 0,
        max_score: Number(entry?.max_score) || 0,
        percentage: Number(entry?.percentage) || 0,
        mastery_band: band,
        // Anything short of Mastered is what the learning path targets.
        gap_identified: band !== MASTERY_BAND.MASTERED,
      };
    }),
    recommended_learning_path: Array.isArray(result?.recommended_learning_path)
      ? result.recommended_learning_path
      : [],
    next_action: result?.next_action ?? null,
  };
}

/** The mock fixture is already domain-grouped; only the vocabulary differs. */
function mockDiagnosticView() {
  return {
    attempt_id: `mock-attempt-${Date.now()}`,
    total_questions: diagnosticMock.total_questions,
    time_limit_minutes: diagnosticMock.time_limit_minutes,
    domains: diagnosticMock.domains.map((domain) => ({
      domain: domain.domain,
      competency_id: domain.competency_id,
      questions: domain.questions.map((question) => ({
        question_id: question.question_id,
        question_text: question.question_text,
        question_type: SUPPORTED_QUESTION_TYPE,
        options: toOptions(question.options),
        order_index: question.order_index,
      })),
    })),
    started_at: null,
    saved_answers: {},
  };
}

function mockReportView(attemptId) {
  return {
    attempt_id: attemptId ?? `mock-attempt-${Date.now()}`,
    status: "scored",
    total_score: submitMock.total_score,
    max_score: submitMock.max_score,
    percentage: submitMock.percentage,
    domain_scores: submitMock.domain_scores.map((entry) => {
      const band = bandFor(entry.mastery_level);

      return {
        domain: entry.domain,
        competency_id: entry.competency_id,
        score: entry.score,
        max_score: entry.max_score,
        percentage: entry.percentage,
        mastery_band: band,
        gap_identified: band !== MASTERY_BAND.MASTERED,
      };
    }),
    recommended_learning_path: [],
    next_action: { type: "dashboard", label: "Return to Dashboard" },
  };
}

/**
 * Starts the learner's diagnostic attempt, or resumes the one already open.
 *
 * Replaces the retired `GET /assessment/questions`. Two canonical calls:
 * `GET /assessments?type=diagnostic` to find the published diagnostic, then
 * `POST /assessments/{assessment_id}/attempts` to start or resume.
 */
export async function startDiagnostic() {
  if (USE_MOCK) {
    await delay(400);
    return mockDiagnosticView();
  }

  const assessments = await request("/assessments?type=diagnostic");
  const list = Array.isArray(assessments) ? assessments : [];
  const diagnostic = list.find((entry) => entry?.type === "diagnostic") ?? list[0];

  if (!diagnostic?.id) {
    throw new AssessmentError(
      "No diagnostic assessment has been published for your grade yet.",
      { status: 404 },
    );
  }

  const attempt = await request(`/assessments/${diagnostic.id}/attempts`, {
    method: "POST",
  });

  return toDiagnosticView(attempt);
}

/**
 * Finalizes an attempt. Scoring, persistence, and learning-path generation all
 * happen server-side; nothing here grades anything.
 *
 * Replaces the retired `POST /assessment/submit`.
 */
export async function submitDiagnostic({ attemptId, answers, idempotencyKey }) {
  if (USE_MOCK) {
    await delay(600);
    return mockReportView(attemptId);
  }

  if (!attemptId) {
    throw new AssessmentError(
      "This attempt is no longer active. Reload the page and start again.",
    );
  }

  const result = await request(`/assessment-attempts/${attemptId}/submit`, {
    method: "POST",
    idempotencyKey,
    body: { answers },
  });

  return toReportView(result);
}

/**
 * Whether this learner has already completed the diagnostic.
 *
 * Replaces the retired `GET /assessment/status/{student_id}`. The learner's
 * `student_id` is read from `GET /students/me` rather than assumed from the
 * token: `app.student_profiles.student_id` is its own key and is not the auth
 * user id carried in `sub`.
 */
export async function getDiagnosticStatus() {
  if (USE_MOCK) {
    await delay(200);
    return {
      status: "not_started",
      latest_attempt_id: null,
      latest_score: null,
      reassessment_eligible: false,
    };
  }

  const me = await request("/students/me");
  const studentId = me?.student_id ?? me?.id ?? null;

  if (!studentId) {
    throw new AssessmentError("We could not load your learner profile.");
  }

  return request(`/students/${studentId}/diagnostic-status`);
}
