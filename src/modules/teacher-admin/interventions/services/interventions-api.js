/**
 * Feature API calls for the Teacher Interventions workspace.
 *
 * The deterministic endpoints (queue, detail, record, update, archive) are the
 * only source of what a learner's case is. Advisory text is asked for
 * explicitly by a teacher, generated server-side and stored against the case;
 * the class-level pattern summary stays a plain advisory read. None of it
 * blocks the deterministic evidence or decides severity, status, or the queue.
 *
 * This wraps the module's private transport (api-client.js), which normalises
 * every reply to `{ok, status, data, meta, error, code, fields, requestId}`.
 */

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { secureApiBaseUrl } from "@/modules/shared/utils/api-url";

import { createApiClient } from "./api-client";
import { apiBaseUrlFrom } from "../../../../lib/api/base-url.js";

function apiBaseUrl() {
  return apiBaseUrlFrom(process.env.NEXT_PUBLIC_API_BASE_URL, secureApiBaseUrl);
}

async function getAccessToken() {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    return error ? null : (data?.session?.access_token ?? null);
  } catch {
    return null;
  }
}

const client = createApiClient({
  baseUrl: apiBaseUrl(),
  getAccessToken,
});

function withQuery(path, params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Reads the intervention queue with the documented deterministic filters.
 *
 * @param {object} [options]
 * @param {string|null} [options.studentId]
 * @param {string|null} [options.gradeId]
 * @param {string|null} [options.sectionId]
 * @param {string|null} [options.competencyId]
 * @param {"HIGH"|"MEDIUM"|"LOW"|null} [options.severity]
 * @param {"Needs Intervention"|"In Progress"|"Resolved"|null} [options.status]
 * @param {string|null} [options.dateFrom] - Only cases opened on or after this date
 * @param {string|null} [options.dateTo] - Only cases opened on or before this date
 * @param {number|null} [options.minAttempts] - Only cases with at least this many attempts
 * @param {number|null} [options.minScoreDrop] - Only cases whose diagnostic-to-current drop is this many points or more
 * @param {number} [options.page]
 * @param {number} [options.pageSize]
 */
export function listInterventionCases({
  studentId = null,
  gradeId = null,
  sectionId = null,
  competencyId = null,
  severity = null,
  status = null,
  dateFrom = null,
  dateTo = null,
  minAttempts = null,
  minScoreDrop = null,
  page = 1,
  pageSize = 100,
} = {}) {
  return client.request(
    withQuery("/interventions", {
      student_id: studentId,
      grade_id: gradeId,
      section_id: sectionId,
      competency_id: competencyId,
      severity,
      status,
      date_from: dateFrom,
      date_to: dateTo,
      min_attempts: minAttempts,
      min_score_drop: minScoreDrop,
      page,
      page_size: pageSize,
    })
  );
}

/**
 * Reads one case with its deterministic evidence and advisory text, if any.
 *
 * @param {string} interventionId
 */
export function readInterventionCase(interventionId) {
  return client.request(`/interventions/${interventionId}`);
}

/**
 * Records a new case, or the first action on one the system opened.
 *
 * @param {object} payload
 * @param {string} payload.studentId
 * @param {string} payload.competencyId
 * @param {"HIGH"|"MEDIUM"|"LOW"} payload.severity
 * @param {string} payload.interventionType
 * @param {string|null} [payload.educatorNotes]
 */
export function recordIntervention(payload) {
  return client.request("/interventions", {
    method: "POST",
    body: {
      student_id: payload.studentId,
      competency_id: payload.competencyId,
      severity: payload.severity,
      intervention_type: payload.interventionType,
      educator_notes: payload.educatorNotes ?? null,
    },
  });
}

/**
 * Updates severity, type, notes, or lifecycle status on an existing case.
 * Status transitions are enforced in the database, not by this client.
 *
 * @param {string} interventionId
 * @param {object} patch
 * @param {"HIGH"|"MEDIUM"|"LOW"} [patch.severity]
 * @param {string} [patch.interventionType]
 * @param {string|null} [patch.educatorNotes]
 * @param {"Needs Intervention"|"In Progress"|"Resolved"} [patch.status]
 * @param {string} [patch.reopenReason]
 */
export function updateIntervention(interventionId, patch) {
  return client.request(`/interventions/${interventionId}`, {
    method: "PATCH",
    body: {
      severity: patch.severity ?? null,
      intervention_type: patch.interventionType ?? null,
      educator_notes: patch.educatorNotes ?? null,
      status: patch.status ?? null,
      reopen_reason: patch.reopenReason ?? null,
    },
  });
}

/**
 * Archives an incorrect or duplicate case. Cases are never deleted.
 *
 * @param {string} interventionId
 */
export function archiveIntervention(interventionId) {
  return client.request(`/interventions/${interventionId}`, { method: "DELETE" });
}

/**
 * Asks the server for advisory support on one case, and keeps what it said.
 *
 * The browser sends no evidence and no text. The API assembles the evidence
 * from the case's own deterministic record, calls Groq server-side, and stores
 * the answer in the case's advisory columns, so nothing a client could write
 * can arrive in a field the interface labels as machine-written.
 *
 * Storing is not applying: severity, status, type and the educator's notes are
 * untouched, and the teacher still decides what to record. A refusal carries
 * `code === "groq_assistance_unavailable"` and leaves the case unchanged.
 *
 * @param {string} interventionId
 */
export function generateInterventionSuggestion(interventionId) {
  return client.request(`/interventions/${interventionId}/ai-suggestion`, {
    method: "POST",
    body: {},
  });
}

/**
 * Advisory class-level pattern summary for a teacher reviewing a filtered batch
 * of cases. Same advisory boundary as `fetchTeacherInsight`: never decides
 * severity, status, or which learners need help.
 *
 * @param {object} payload
 * @param {string|null} [payload.grade]
 * @param {string|null} [payload.competencyId]
 * @param {string|null} [payload.displayContext]
 * @param {Array} [payload.incorrectAttempts]
 */
export function fetchPatternAnalysis(payload) {
  return client.request("/ai/pattern-analysis", {
    method: "POST",
    body: {
      grade: payload.grade ?? null,
      competency_id: payload.competencyId ?? null,
      display_context: payload.displayContext ?? null,
      incorrect_attempts: payload.incorrectAttempts ?? [],
    },
  });
}