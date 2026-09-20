/**
 * What the name form refuses, and what it must not carry between openings.
 *
 * The reset is the one that matters: the dialog used to reopen showing an
 * abandoned draft, and re-announce a stale failure through `role="alert"` for
 * a save the learner was no longer attempting.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_NAME_LENGTH, MIN_NAME_LENGTH, nameRejectionReason } from "../utils/name.js";

describe("nameRejectionReason", () => {
  it("states the same bounds the API enforces", () => {
    assert.equal(MIN_NAME_LENGTH, 2);
    assert.equal(MAX_NAME_LENGTH, 120);
  });

  it("accepts an ordinary name", () => {
    assert.equal(nameRejectionReason("Ana Reyes"), null);
  });

  it("accepts the shortest name allowed", () => {
    assert.equal(nameRejectionReason("Al"), null);
  });

  it("accepts the longest name allowed", () => {
    assert.equal(nameRejectionReason("a".repeat(120)), null);
  });

  it("refuses one character", () => {
    assert.match(nameRejectionReason("A"), /between 2 and 120/);
  });

  it("refuses one character past the limit", () => {
    assert.match(nameRejectionReason("a".repeat(121)), /between 2 and 120/);
  });

  it("refuses a name that is only spaces", () => {
    // Trimmed before measuring, so whitespace cannot stand in for a name.
    assert.match(nameRejectionReason("     "), /between 2 and 120/);
  });

  it("measures the trimmed name, not what was typed around it", () => {
    assert.equal(nameRejectionReason("  Ana Reyes  "), null);
    assert.match(nameRejectionReason("  A  "), /between 2 and 120/);
  });

  it("refuses nothing at all", () => {
    assert.match(nameRejectionReason(""), /between 2 and 120/);
    assert.match(nameRejectionReason(null), /between 2 and 120/);
    assert.match(nameRejectionReason(undefined), /between 2 and 120/);
  });
});
