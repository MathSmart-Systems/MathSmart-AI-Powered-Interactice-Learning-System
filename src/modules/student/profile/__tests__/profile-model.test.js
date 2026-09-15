/**
 * Unit tests for the profile model builder.
 *
 * The model is the only thing between the API contracts and the view, so these
 * tests keep the view dumb: every selected value, resolved status label, and
 * null-safe fallback is pinned here rather than inferred at render time.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildProfileModel, firstGivenName, initials } from "../utils/profile-model.js";

const LEARNER = {
  full_name: "Juan Dela Cruz",
  learner_id: "STU-2026-001",
  grade_name: "Grade 6",
  section_name: "Rizal",
  school_name: "San Jose Elementary School",
  monitoring_status: "active",
  diagnostic_status: "completed",
};

const ACCOUNT = { email: "juan.delacruz@school.edu.ph" };

describe("initials", () => {
  it("extracts the first two initials from a name", () => {
    assert.equal(initials("Juan Dela Cruz"), "JD");
  });

  it("returns one initial for a single-word name", () => {
    assert.equal(initials("Juan"), "J");
  });

  it("handles leading and trailing whitespace", () => {
    assert.equal(initials("  Ana Maria  "), "AM");
  });

  it("returns null for empty, whitespace-only, or missing values", () => {
    assert.equal(initials(null), null);
    assert.equal(initials(""), null);
    assert.equal(initials("   "), null);
  });
});

describe("firstGivenName", () => {
  it("returns the first name", () => {
    assert.equal(firstGivenName("Juan Dela Cruz"), "Juan");
  });

  it("trims whitespace", () => {
    assert.equal(firstGivenName("  Ana Maria  "), "Ana");
  });

  it("returns null for a missing value", () => {
    assert.equal(firstGivenName(null), null);
  });
});

describe("buildProfileModel", () => {
  it("builds a complete model from learner and account", () => {
    const model = buildProfileModel({ learner: LEARNER, account: ACCOUNT });

    assert.equal(model.fullName, "Juan Dela Cruz");
    assert.equal(model.firstName, "Juan");
    assert.equal(model.initials, "JD");
    assert.equal(model.email, "juan.delacruz@school.edu.ph");
    assert.equal(model.learnerId, "STU-2026-001");
    assert.equal(model.gradeName, "Grade 6");
    assert.equal(model.sectionName, "Rizal");
    assert.equal(model.schoolName, "San Jose Elementary School");
    assert.equal(model.monitoring.label, "Active");
    assert.equal(model.diagnostic.label, "Completed");
  });

  it("resolves null grade and section to null", () => {
    const unassigned = { ...LEARNER, grade_name: null, section_name: null };
    const model = buildProfileModel({ learner: unassigned, account: ACCOUNT });

    assert.equal(model.gradeName, null);
    assert.equal(model.sectionName, null);
    assert.equal(model.schoolName, "San Jose Elementary School");
  });

  it("tolerates a missing account", () => {
    const model = buildProfileModel({ learner: LEARNER, account: null });

    assert.equal(model.email, null);
    assert.equal(model.fullName, "Juan Dela Cruz");
  });

  it("tolerates a completely missing learner without throwing", () => {
    const model = buildProfileModel({ learner: null, account: null });

    assert.equal(model.fullName, null);
    assert.equal(model.firstName, null);
    assert.equal(model.email, null);
    assert.equal(model.monitoring.label, "Not available");
    assert.equal(model.diagnostic.label, "Not available");
  });
});