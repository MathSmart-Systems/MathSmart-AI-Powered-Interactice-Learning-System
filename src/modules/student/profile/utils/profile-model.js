/**
 * Turns the identity and enrolment contracts into exactly what the profile
 * renders.
 *
 * The profile shows two records the API already owns: the learner's own record
 * (`GET /students/me`) and their verified account identity (`GET /auth/me`).
 * Nothing here decides a status or a fact; it picks which value is shown and
 * what it is called, and stays null-safe so an unassigned learner still gets a
 * clean page instead of a crash.
 */

import { diagnosticStatus, monitoringStatus } from "./labels.js";

/** A trimmed string, or `null` for any value the API left unanswered. */
function nullableString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The learner's initials, for the monogram that can exist without an avatar. */
export function initials(fullName) {
  const name = nullableString(fullName);
  if (!name) {
    return null;
  }

  const parts = name.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

/** The learner's given name, for the greeting and the monogram title. */
export function firstGivenName(fullName) {
  const name = nullableString(fullName);
  if (!name) {
    return null;
  }

  const [given] = name.split(/\s+/);
  return given || null;
}

/**
 * The serialisable model for the profile page.
 *
 * `monitoring` and `diagnostic` are the resolved vocabulary objects, so the
 * view reads words, not enum values.
 */
export function buildProfileModel({ learner, account }) {
  const fullName = nullableString(learner?.full_name);
  const email = nullableString(account?.email);

  return {
    fullName,
    firstName: firstGivenName(fullName),
    initials: initials(fullName),
    email,
    learnerId: nullableString(learner?.learner_id),
    gradeName: nullableString(learner?.grade_name),
    sectionName: nullableString(learner?.section_name),
    schoolName: nullableString(learner?.school_name),
    monitoring: monitoringStatus(learner?.monitoring_status),
    diagnostic: diagnosticStatus(learner?.diagnostic_status),
  };
}