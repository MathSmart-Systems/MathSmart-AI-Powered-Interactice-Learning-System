const IDEMPOTENCY_KEY_PREFIX = "mathsmart:diagnostic-submit:";
const DRAFT_KEY_PREFIX = "mathsmart:diagnostic-draft:";

export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `diag-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function submissionStorageKey(attemptId) {
  return `${IDEMPOTENCY_KEY_PREFIX}${attemptId}`;
}

export function idempotencyKeyForAttempt(attemptId) {
  if (typeof window === "undefined" || !attemptId) return newIdempotencyKey();

  const storageKey = submissionStorageKey(attemptId);
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) return saved;

    const created = newIdempotencyKey();
    window.localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return newIdempotencyKey();
  }
}

export function clearIdempotencyKey(attemptId) {
  if (typeof window !== "undefined" && attemptId) {
    try {
      window.localStorage.removeItem(submissionStorageKey(attemptId));
    } catch {
      // Storage failure should not block submission completion
    }
  }
}

export function draftStorageKey(attemptId) {
  return `${DRAFT_KEY_PREFIX}${attemptId}`;
}

export function readDraft(attemptId) {
  if (typeof window === "undefined" || !attemptId) return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(draftStorageKey(attemptId)) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function writeDraft(attemptId, draft) {
  if (typeof window === "undefined" || !attemptId) return;
  try {
    if (Object.keys(draft).length > 0) {
      window.localStorage.setItem(draftStorageKey(attemptId), JSON.stringify(draft));
    } else {
      window.localStorage.removeItem(draftStorageKey(attemptId));
    }
  } catch {
    // In-memory answers and server autosave remain available when storage is blocked.
  }
}

export function clearDraft(attemptId) {
  if (typeof window === "undefined" || !attemptId) return;
  try {
    window.localStorage.removeItem(draftStorageKey(attemptId));
  } catch {
    // Submission already succeeded; unavailable storage needs no recovery action.
  }
}

export function reconcileDraftAnswers(serverAnswers, draftAnswers, deliveredIds) {
  const allowed = deliveredIds instanceof Set ? deliveredIds : new Set(deliveredIds ?? []);
  const merged = {};

  for (const source of [serverAnswers, draftAnswers]) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    for (const [questionId, answer] of Object.entries(source)) {
      if (allowed.has(questionId)) merged[questionId] = String(answer ?? "");
    }
  }

  return merged;
}

export function clearSavedDraftAnswers(draftAnswers, savedEntries) {
  const remaining = { ...(draftAnswers ?? {}) };
  for (const entry of savedEntries ?? []) {
    if (
      Object.hasOwn(remaining, entry.question_id) &&
      remaining[entry.question_id] === String(entry.answer ?? "")
    ) {
      delete remaining[entry.question_id];
    }
  }
  return remaining;
}
