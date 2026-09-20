const SUBMISSION_KEY_PREFIX = "mathsmart:activity-submit:";

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function storageKey(attemptId) {
  return `${SUBMISSION_KEY_PREFIX}${attemptId}`;
}

export function activitySubmissionForAttempt(attemptId, body, storage = globalThis.localStorage) {
  if (!attemptId) return { idempotencyKey: newIdempotencyKey(), body };

  try {
    const key = storageKey(attemptId);
    const saved = JSON.parse(storage?.getItem(key) ?? "null");
    if (saved?.idempotencyKey && saved?.body) return saved;

    const submission = { idempotencyKey: newIdempotencyKey(), body };
    storage?.setItem(key, JSON.stringify(submission));
    return submission;
  } catch {
    return { idempotencyKey: newIdempotencyKey(), body };
  }
}

export function clearActivitySubmission(attemptId, storage = globalThis.localStorage) {
  if (!attemptId) return;
  try {
    storage?.removeItem(storageKey(attemptId));
  } catch {
    // Submission already succeeded; blocked storage needs no recovery action.
  }
}
