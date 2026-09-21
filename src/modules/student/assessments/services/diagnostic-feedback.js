/**
 * Advisory Groq AI student feedback helpers.
 *
 * Prepares request payloads adhering strictly to the backend
 * `StudentFeedbackRequest` schema:
 * - score: float (0-100)
 * - mastery_band: string (max 40)
 * - competency_id: UUID | null
 * - display_context: string (max 2000)
 * Extra fields are excluded to comply with extra="forbid".
 */

export function buildFeedbackPayload({
  competencyId = null,
  score = null,
  masteryBand = null,
  displayContext = null,
} = {}) {
  const payload = {};

  if (competencyId && typeof competencyId === "string") {
    payload.competency_id = competencyId;
  }

  if (typeof score === "number" && Number.isFinite(score)) {
    payload.score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));
  }

  if (masteryBand && typeof masteryBand === "string") {
    payload.mastery_band = masteryBand.trim().slice(0, 40);
  }

  if (displayContext && typeof displayContext === "string") {
    payload.display_context = displayContext.trim().slice(0, 2000);
  }

  return payload;
}

/**
 * Build rich, structured assessment context so Groq understands the exact assessment,
 * what was tested, and the difference in performance between competencies.
 */
export function buildAssessmentFeedbackContext({
  assessmentTitle = "Diagnostic Assessment",
  percentage = 0,
  totalScore = null,
  maxScore = null,
  domainScores = [],
  focusedCompetency = null,
} = {}) {
  const cleanTitle = (assessmentTitle || "Grade 6 Diagnostic Assessment")
    .replace(/\s*\(ID\s+[A-Za-z0-9-]+\)/gi, "")
    .replace(/\s*47EC5A\b/gi, "")
    .trim();

  const mastered = [];
  const developing = [];
  const needsImprovement = [];

  const allCleanNames = [];

  for (const entry of domainScores) {
    const rawName = entry?.domain || "Competency";
    const cleanName =
      rawName
        .replace(/\s*\(ID\s+[A-Za-z0-9-]+\)/gi, "")
        .replace(/\s*47EC5A\b/gi, "")
        .replace(/\s*competency\b/gi, "")
        .trim() || "General Math";

    allCleanNames.push(cleanName);

    const sVal = entry?.score ?? entry?.raw_score;
    const mVal = entry?.max_score ?? entry?.maxScore;

    const scoreStr =
      sVal != null && mVal != null
        ? `${cleanName} (${sVal}/${mVal}, ${entry.percentage ?? 0}%)`
        : `${cleanName} (${entry?.percentage ?? 0}%)`;

    const band = String(entry?.mastery_band ?? "").toLowerCase();
    if (band === "mastered") {
      mastered.push(scoreStr);
    } else if (band === "developing") {
      developing.push(scoreStr);
    } else {
      needsImprovement.push(scoreStr);
    }
  }

  const focusNotice = focusedCompetency
    ? ` The student is currently focusing on: "${focusedCompetency}".`
    : "";

  const diffSection =
    mastered.length > 0 && (developing.length > 0 || needsImprovement.length > 0)
      ? `Performance difference: The student excels in ${mastered.join(", ")}, but has growth opportunities in ${[...developing, ...needsImprovement].join(", ")}.`
      : allCleanNames.length > 0
        ? `Topics assessed: ${allCleanNames.join(", ")}.`
        : "";

  return [
    `Assessment: "${cleanTitle}".`,
    `Overall result: ${percentage}%${totalScore != null && maxScore != null ? ` (${totalScore}/${maxScore} points)` : ""}.`,
    mastered.length > 0 ? `Mastered areas: ${mastered.join(", ")}.` : null,
    developing.length > 0 ? `Developing areas: ${developing.join(", ")}.` : null,
    needsImprovement.length > 0
      ? `Needs improvement: ${needsImprovement.join(", ")}.`
      : null,
    diffSection,
    focusNotice,
    `Provide a personalized, encouraging 2-paragraph summary tailored for a Grade 6 learner. Point out the specific difference between what they mastered and where they can improve, with a clear next step. Avoid raw tables, UUIDs, or test codes.`,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 2000);
}

export function getMockFeedback({ score = 50 } = {}) {
  const scoreVal = typeof score === "number" ? score : 50;
  const text =
    scoreVal >= 80
      ? "Outstanding performance on your diagnostic assessment! You've demonstrated solid mastery of key grade-level foundations. Keep this momentum going as you tackle upcoming enrichment modules."
      : scoreVal >= 50
        ? "Good effort on your diagnostic assessment! You have a solid grasp of foundational concepts, with a few specific competencies that will benefit from focused review before moving forward."
        : "Thank you for completing your diagnostic assessment! This gives your teacher a clear picture of your current starting point. Following your personalized learning path will help you rebuild confidence step-by-step.";

  return {
    feedback_text: text,
    friendly_tip: null,
    encouragement: null,
    // "mock", not "groq". This text was written here, in this file, by a
    // developer — labelling it as Groq output made a canned sentence
    // indistinguishable from a real one on screen, and the only tell was a
    // model name nobody reads.
    provider: "mock",
    model: "mock-groq-model",
    generated_at: new Date().toISOString(),
    confidence_score: null,
  };
}

export function fallbackMessage(status) {
  switch (status) {
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You do not have access to this assessment.";
    case 404:
      return "The diagnostic assessment is not available yet.";
    // Two different refusals share this status now: an attempt that has
    // already been submitted, and a published paper the server cannot
    // deliver. Only a reply whose body would not parse reaches this line, so
    // it must not assert either one — naming both is honest, and a learner
    // can act on either. It must never become "check your connection", which
    // is the one thing that is certainly not the matter.
    case 409:
      return "This assessment cannot be opened right now. It may already be submitted, or your teacher may still be setting it up.";
    case 412:
      return "You are not eligible to take this assessment right now.";
    case 422:
      return "Some answers could not be accepted. Please review and try again.";
    case 503:
      return "AI assistance is currently unavailable. Your scores and results are unaffected.";
    default:
      return "Something went wrong while loading your assessment. Please try again.";
  }
}
