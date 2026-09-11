/**
 * Turns the two authoring contracts into exactly what the catalogue renders.
 *
 * Discovery here is selection and wording, never content decisions: publication
 * state, domains, codes and grade scoping arrive already decided by
 * `GET /teacher-admin/competencies` and `GET /teacher-admin/grades`. This module
 * only picks which of those values the cards show and what the grade is called,
 * so it stays pure and unit-testable without a request.
 */

import { publicationStatus } from "./competency-status.js";

/** A grade as the create form and cards need it. */
export function toGrade(row) {
  return {
    id: row?.grade_id ?? null,
    name: typeof row?.name === "string" ? row.name : null,
    level: typeof row?.level === "number" ? row.level : null,
    isActive: Boolean(row?.is_active),
  };
}

/** `grades` as a lookup, so cards resolve a grade id to its name once. */
export function gradeLookup(grades) {
  const lookup = new Map();
  for (const grade of Array.isArray(grades) ? grades : []) {
    if (grade.id) {
      lookup.set(grade.id, grade);
    }
  }
  return lookup;
}

/** One competency from the authoring list, resolved for display. */
export function toCompetency(row, gradesById = new Map()) {
  const status = publicationStatus(row?.status);
  const grade = row?.grade_id ? gradesById.get(row.grade_id) : null;

  return {
    id: row?.competency_id ?? null,
    code: row?.code ?? null,
    name: typeof row?.name === "string" && row.name.trim() ? row.name : "Untitled competency",
    domain: row?.domain ?? null,
    gradeId: row?.grade_id ?? null,
    gradeName: grade?.name ?? null,
    description:
      typeof row?.description === "string" && row.description.trim()
        ? row.description
        : null,
    status: row?.status ?? null,
    statusLabel: status.label,
    statusBadge: status.badge,
    statusSummary: status.summary,
    prerequisiteIds: Array.isArray(row?.prerequisite_ids) ? row.prerequisite_ids : [],
    createdLabel: readableDate(row?.created_at),
    updatedLabel: readableDate(row?.updated_at),
  };
}

/**
 * Builds the catalogue view model.
 *
 * @param {object} input
 * @param {Array|undefined} input.competencies data from `GET /teacher-admin/competencies`
 * @param {object|null} input.meta pagination metadata from the same response
 * @param {Array|undefined} input.grades data from `GET /teacher-admin/grades`
 * @param {boolean} input.gradesUnavailable true when the grades read failed
 */
export function buildCompetenciesModel({ competencies, meta, grades, gradesUnavailable }) {
  const gradeList = (Array.isArray(grades) ? grades : []).map(toGrade);
  const byId = gradeLookup(gradeList);
  const items = (Array.isArray(competencies) ? competencies : [])
    .map((row) => toCompetency(row, byId))
    .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""));

  const total = typeof meta?.total_items === "number" ? meta.total_items : items.length;

  return {
    items,
    isEmpty: items.length === 0,
    // The read asks for the whole authoring catalogue in one call; a total that
    // still exceeds it would have been silently truncated, so it is surfaced.
    truncated: total > items.length,
    totalCount: total,
    grades: gradeList,
    gradesUnavailable,
  };
}

/** A calendar date a Teacher/Administrator can read, or `null` without one. */
export function readableDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return DATE_FORMAT.format(date);
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});