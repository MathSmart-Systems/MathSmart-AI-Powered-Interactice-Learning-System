/**
 * Authoring actions for the competency catalogue.
 *
 * A Teacher/Administrator creates, edits and archives competencies from the
 * catalogue page. Ranking, progression, mastery and unlock order are untouched
 * here — this surface only changes the catalogue itself. Every write goes
 * through the MathSmart API as the shop's own signed token; the API validates
 * the draft, runs the update through Row Level Security, and decides whether
 * the change is legal (for example a code that already exists).
 *
 * Each action returns `{ ok: true }` or `{ ok: false, error }` and knows
 * nothing about where the request came from, so the catalogue page can reuse
 * the same fallback copy for the create dialog, the edit dialog and the archive
 * confirmation.
 */

"use server";

import { revalidatePath } from "next/cache";

import { apiRequest, readApiError } from "../services/mathsmart-api";

const CATALOGUE_PATH = "/teacher/competencies";

/** Human-readable check BEFORE the round trip, so a genuinely empty form gets a
 *  fast, obvious answer. Length and shape rules still belong to the API. */
function requiredText(value, label) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : { missing: label };
}

function raiseFirstMissing(values) {
  for (const [label, value] of values) {
    const checked = requiredText(value, label);
    if (checked?.missing) {
      return checked.missing;
    }
  }
  return null;
}

function draftFromForm(formData) {
  return {
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    grade_id: String(formData.get("grade_id") ?? "").trim(),
    domain: String(formData.get("domain") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    status: String(formData.get("status") ?? "draft").trim(),
  };
}

/**
 * Creates a new competency draft.
 *
 * @param {object|null} _state ignored; kept for `useActionState`'s signature
 * @param {FormData} formData
 */
export async function createCompetencyAction(_state, formData) {
  const draft = draftFromForm(formData);
  const missing = raiseFirstMissing([
    ["Code", draft.code],
    ["Name", draft.name],
    ["Grade", draft.grade_id],
    ["Domain", draft.domain],
  ]);

  if (missing) {
    return { ok: false, error: { message: `${missing} is required to save a competency.` } };
  }

  const result = await apiRequest("/teacher-admin/competencies", {
    method: "POST",
    body: draft,
  });

  if (!result.ok) {
    return { ok: false, error: readApiError(result) };
  }

  revalidatePath(CATALOGUE_PATH, "page");
  return { ok: true };
}

/**
 * Saves the editable details of one competency.
 *
 * @param {object|null} _state ignored; kept for `useActionState`'s signature
 * @param {FormData} formData must carry the competency's own id
 */
export async function updateCompetencyAction(_state, formData) {
  const competencyId = String(formData.get("competency_id") ?? "").trim();

  if (!competencyId) {
    return {
      ok: false,
      error: { message: "MathSmart could not identify which competency to update." },
    };
  }

  const draft = draftFromForm(formData);
  const missing = raiseFirstMissing([
    ["Code", draft.code],
    ["Name", draft.name],
    ["Grade", draft.grade_id],
    ["Domain", draft.domain],
  ]);

  if (missing) {
    return { ok: false, error: { message: `${missing} is required to save a competency.` } };
  }

  const result = await apiRequest(`/teacher-admin/competencies/${competencyId}`, {
    method: "PATCH",
    body: draft,
  });

  if (!result.ok) {
    return { ok: false, error: readApiError(result) };
  }

  revalidatePath(CATALOGUE_PATH, "page");
  return { ok: true };
}

/**
 * Archives a competency (the catalogue keeps the row for learner history).
 *
 * @param {object|null} _state ignored; kept for `useActionState`'s signature
 * @param {FormData} formData must carry the competency's own id
 */
export async function archiveCompetencyAction(_state, formData) {
  const competencyId = String(formData.get("competency_id") ?? "").trim();

  if (!competencyId) {
    return {
      ok: false,
      error: { message: "MathSmart could not identify which competency to archive." },
    };
  }

  const result = await apiRequest(`/teacher-admin/competencies/${competencyId}`, {
    method: "DELETE",
  });

  if (!result.ok) {
    return { ok: false, error: readApiError(result) };
  }

  revalidatePath(CATALOGUE_PATH, "page");
  return { ok: true };
}