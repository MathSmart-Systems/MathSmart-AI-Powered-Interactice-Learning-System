const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const ATTEMPT_STATUS = Object.freeze({
  IN_PROGRESS: "in_progress",
  SUBMITTED: "submitted",
  SCORED: "scored",
});

const STATUS_LABELS = Object.freeze({
  [ATTEMPT_STATUS.IN_PROGRESS]: "In progress",
  [ATTEMPT_STATUS.SUBMITTED]: "Submitted",
  [ATTEMPT_STATUS.SCORED]: "Scored",
});

export function attemptStatusLabel(status) {
  const value = String(status ?? "").trim().toLowerCase();
  return STATUS_LABELS[value] ?? (value ? value.replaceAll("_", " ") : "Status unavailable");
}

export function mockAssessmentHistory() {
  return {
    state: "ready",
    attempts: [],
    meta: { page: 1, page_size: 20, total: 0 },
  };
}

export function normalizeAttemptHistory(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((attempt) => attempt && attempt.attempt_id && attempt.assessment_id)
    .map((attempt) => ({
      attemptId: String(attempt.attempt_id),
      assessmentId: String(attempt.assessment_id),
      title: attempt.title || "Mathematics assessment",
      type: attempt.type || null,
      status: String(attempt.status || ""),
      statusLabel: attemptStatusLabel(attempt.status),
      score: Number.isFinite(Number(attempt.overall_score))
        ? Number(attempt.overall_score)
        : null,
      startedAt: attempt.started_at || null,
      submittedAt: attempt.submitted_at || null,
      reportHref:
        attempt.status === ATTEMPT_STATUS.SCORED && attempt.type === "diagnostic"
          ? `/student/assessments/diagnostic?attempt=${encodeURIComponent(attempt.attempt_id)}`
          : null,
    }));
}

export function parseAttemptQuery(value) {
  if (value === undefined) return { attemptId: null, invalid: false };
  if (typeof value !== "string" || !CANONICAL_UUID_PATTERN.test(value)) {
    return { attemptId: null, invalid: true };
  }

  return { attemptId: value, invalid: false };
}

export function initialDiagnosticScreen(preview, requestedAttemptId = null) {
  if (requestedAttemptId) return { screen: "report", attemptId: requestedAttemptId };
  if (preview?.diagnostic_status === "in_progress") {
    return { screen: "resume", attemptId: preview.latest_attempt_id ?? null };
  }
  if (preview?.latest_status === ATTEMPT_STATUS.SUBMITTED) {
    return { screen: "pending", attemptId: preview.latest_attempt_id ?? null };
  }
  if (preview?.diagnostic_status === "completed" && !preview?.reassessment_eligible) {
    return { screen: "report", attemptId: preview.latest_attempt_id ?? null };
  }
  return { screen: "intro", attemptId: null };
}

export function submissionConfirmation(questions, answers) {
  const items = Array.isArray(questions) ? questions : [];
  const values = answers && typeof answers === "object" ? answers : {};
  const unanswered = items.filter((question) => {
    const value = values[question.id];
    return value === undefined || String(value).trim() === "";
  });

  return {
    unanswered,
    unansweredCount: unanswered.length,
    isComplete: unanswered.length === 0,
    message:
      unanswered.length === 0
        ? "All questions are answered. Confirm when you are ready to finish."
        : `${unanswered.length} ${unanswered.length === 1 ? "question is" : "questions are"} still blank. Blank answers count as incorrect.`,
  };
}
