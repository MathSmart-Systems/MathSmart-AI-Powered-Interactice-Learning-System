/**
 * Server-side reads for the competency catalogue.
 *
 * This module runs only on the server. It forwards the caller's own Supabase
 * access token to the MathSmart API (via the shared `mathsmart-api` helpers)
 * and asks it for the authoring list and the grade options; it never queries a
 * table directly, never touches a secret key, and never decides a publication
 * result of its own. The API verifies the token against the project's JWKS and
 * Row Level Security decides which rows the answer may contain, so a
 * Teacher/Administrator sees every publication state while a student route
 * would see only published work.
 *
 * The authoring list is required — it is what the page is about. The grades are
 * a supporting list for the create form, so an unavailable grades read degrades
 * to an empty list rather than replacing the whole catalogue with a failure.
 */

import { apiBaseUrl, apiRequest } from "./mathsmart-api";

import { buildCompetenciesModel } from "../utils/competencies-model";

const AUTHORING_PAGE_SIZE = 100;

/** Every outcome the catalogue knows how to render. */
export const COMPETENCIES_STATE = Object.freeze({
  READY: "ready",
  ERROR: "error",
});

/**
 * Reads the Teacher/Administrator competency catalogue and its grade options.
 *
 * @returns {Promise<{state: string, model?: object, reason?: string}>}
 */
export async function readCompetenciesCatalogue() {
  if (!apiBaseUrl()) {
    return { state: COMPETENCIES_STATE.ERROR, reason: "unconfigured" };
  }

  const [catalogue, grades] = await Promise.all([
    apiRequest(`/teacher-admin/competencies?page=1&page_size=${AUTHORING_PAGE_SIZE}`),
    apiRequest(`/teacher-admin/grades?page=1&page_size=${AUTHORING_PAGE_SIZE}`),
  ]);

  if (!catalogue.ok) {
    return { state: COMPETENCIES_STATE.ERROR, reason: "unavailable" };
  }

  return {
    state: COMPETENCIES_STATE.READY,
    model: buildCompetenciesModel({
      competencies: catalogue.data,
      meta: catalogue.payload?.meta ?? null,
      grades: grades.ok ? grades.data : [],
      gradesUnavailable: !grades.ok,
    }),
  };
}