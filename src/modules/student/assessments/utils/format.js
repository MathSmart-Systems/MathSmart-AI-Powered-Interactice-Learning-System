const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const ATTEMPT_STATUS = Object.freeze({
  IN_PROGRESS: "in_progress",
  SUBMITTED: "submitted",
  SCORED: "scored",
});

export const LETTERS = Object.freeze(["A", "B", "C", "D", "E", "F"]);

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

export function optionalFiniteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
      score: optionalFiniteNumber(attempt.overall_score),
      startedAt: attempt.started_at || null,
      submittedAt: attempt.submitted_at || null,
      reportHref:
        attempt.status === ATTEMPT_STATUS.SCORED && attempt.type === "diagnostic"
          ? `/student/assessments/diagnostic?attempt=${encodeURIComponent(attempt.attempt_id)}`
          : null,
    }));
}

export function flattenDiagnosticQuestions(domains) {
  const flat = [];

  for (const domain of Array.isArray(domains) ? domains : []) {
    for (const question of Array.isArray(domain?.questions) ? domain.questions : []) {
      flat.push({
        id: question.question_id,
        domain: domain.domain,
        prompt: question.question_text,
        type: question.question_type,
        options: question.options,
        orderIndex: optionalFiniteNumber(question.order_index),
        sourceIndex: flat.length,
      });
    }
  }

  return flat
    .sort((left, right) => {
      if (left.orderIndex === null && right.orderIndex === null) {
        return left.sourceIndex - right.sourceIndex;
      }
      if (left.orderIndex === null) return 1;
      if (right.orderIndex === null) return -1;
      return left.orderIndex - right.orderIndex || left.sourceIndex - right.sourceIndex;
    })
    .map(({ sourceIndex: _sourceIndex, ...question }, index) => ({
      ...question,
      number: index + 1,
    }));
}

export function numericShortcutIndex(event, optionCount, blocked = false) {
  if (
    blocked ||
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    !/^[1-9]$/.test(event.key)
  ) {
    return null;
  }

  const target = event.target;
  if (
    typeof Element !== "undefined" &&
    target instanceof Element &&
    (target.closest("input, textarea, select, button, a, [contenteditable='true']") ||
      target.isContentEditable)
  ) {
    return null;
  }

  const index = Number(event.key) - 1;
  return index < optionCount ? index : null;
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

export function formatClock(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function attemptDeadline(startedAt, limitSeconds) {
  if (startedAt) {
    const startMs = Date.parse(startedAt);
    if (!Number.isNaN(startMs)) {
      return startMs + limitSeconds * 1000;
    }
  }
  return Date.now() + limitSeconds * 1000;
}

export function remainingSeconds(deadlineMs, fallbackSeconds = 60 * 60) {
  if (!deadlineMs) return fallbackSeconds;
  return Math.max(0, Math.round((deadlineMs - Date.now()) / 1000));
}

export function hasAnswer(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

const BAND_STYLE = {
  Mastered: {
    badge: "border-primary/40 bg-primary/10 text-primary",
    bar: "bg-primary",
  },
  Developing: {
    badge: "border-border bg-secondary text-secondary-foreground",
    bar: "bg-primary/45",
  },
  "Needs Improvement": {
    badge: "border-destructive/40 bg-destructive/10 text-destructive",
    bar: "bg-destructive",
  },
};

const NEUTRAL_BAND_STYLE = {
  badge: "border-border bg-secondary text-secondary-foreground",
  bar: "bg-muted-foreground",
};

export function styleForBand(masteryBand) {
  return BAND_STYLE[masteryBand] ?? NEUTRAL_BAND_STYLE;
}
