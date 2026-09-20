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
import { draftFromForm, missingFieldLabel } from "../utils/competency-draft";

const CATALOGUE_PATH = "/teacher/competencies";

/**
 * Creates a new competency draft.
 *
 * @param {object|null} _state ignored; kept for `useActionState`'s signature
 * @param {FormData} formData
 */
export async function createCompetencyAction(_state, formData) {
  const draft = draftFromForm(formData);
  const missing = missingFieldLabel(draft);

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
  const missing = missingFieldLabel(draft);

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

/**
 * Publishes, unpublishes, or restores one competency.
 *
 * Three words for the same call: publication state is a single column, and
 * moving between draft, published and archived is a `PATCH` either way. Kept
 * apart from the edit form because it is the change a teacher makes most
 * often, and it should not require opening a dialog to reach a radio group.
 *
 * @param {string} competencyId
 * @param {"draft"|"published"|"archived"} status
 */
export async function setCompetencyStatusAction(competencyId, status) {
  const id = String(competencyId ?? "").trim();

  if (!id) {
    return {
      ok: false,
      error: { message: "MathSmart could not identify which competency to change." },
    };
  }

  const result = await apiRequest(`/teacher-admin/competencies/${id}`, {
    method: "PATCH",
    body: { status },
  });

  if (!result.ok) {
    return { ok: false, error: readApiError(result) };
  }

  revalidatePath(CATALOGUE_PATH, "page");
  return { ok: true };
}

/**
 * Reads what still points at a competency.
 *
 * Asked before archiving, unpublishing or deleting so each of those can name
 * what it affects. Archiving and unpublishing remove nothing, but they do take
 * a competency's questions and modules out of every learner's view, and a
 * teacher should know that before rather than after.
 */
export async function competencyReferencesAction(competencyId) {
  const id = String(competencyId ?? "").trim();

  if (!id) {
    return { ok: false, error: { message: "MathSmart could not identify that competency." } };
  }

  const result = await apiRequest(`/teacher-admin/competencies/${id}/references`);

  if (!result.ok) {
    return { ok: false, error: readApiError(result) };
  }

  return { ok: true, data: result.data };
}

/**
 * Permanently removes a competency that was never used.
 *
 * Not the archive route, which is what `DELETE` means here and has meant since
 * this module was written. The server refuses anything that is not already
 * archived, and the database refuses anything still referenced — so a
 * competency carrying a question, a module or a learner's recorded work cannot
 * be removed by this, whatever the interface allows.
 */
export async function deleteCompetencyAction(competencyId) {
  const id = String(competencyId ?? "").trim();

  if (!id) {
    return {
      ok: false,
      error: { message: "MathSmart could not identify which competency to delete." },
    };
  }

  const result = await apiRequest(`/teacher-admin/competencies/${id}/delete`, {
    method: "POST",
  });

  if (!result.ok) {
    return { ok: false, error: readApiError(result) };
  }

  revalidatePath(CATALOGUE_PATH, "page");
  return { ok: true };
}
