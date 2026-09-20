/**
 * What the competency form sends, and what it refuses to send.
 *
 * These exist because of a specific failure. The grade field was removed from
 * the form and from the API contract, but the action went on reading
 * `grade_id` from the form and demanding it — so every save answered "Grade is
 * required to save a competency" for a field that no longer existed, and
 * nothing in the suite could see it: the logic lived inside a `"use server"`
 * module no unit test can import.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  REQUIRED_FIELDS,
  draftFromForm,
  missingFieldLabel,
} from "../utils/competency-draft.js";

/** A stand-in for the browser's FormData, which only needs `get` here. */
function form(values = {}) {
  return { get: (name) => (name in values ? values[name] : null) };
}

const COMPLETE = {
  code: "MATH6-NS-01",
  name: "Add and subtract fractions",
  domain: "Numbers and Number Sense",
  description: "Using like and unlike denominators.",
  status: "published",
};

describe("draftFromForm", () => {
  it("carries every field the API accepts", () => {
    assert.deepEqual(draftFromForm(form(COMPLETE)), {
      code: "MATH6-NS-01",
      name: "Add and subtract fractions",
      domain: "Numbers and Number Sense",
      description: "Using like and unlike denominators.",
      status: "published",
    });
  });

  it("never sends a grade", () => {
    // The server resolves Grade 6 itself and the schema forbids the field, so
    // sending one would be refused outright.
    const draft = draftFromForm(form({ ...COMPLETE, grade_id: "some-grade-id" }));
    assert.ok(!("grade_id" in draft));
  });

  it("trims what was typed", () => {
    const draft = draftFromForm(form({ ...COMPLETE, code: "  MATH6-NS-01  " }));
    assert.equal(draft.code, "MATH6-NS-01");
  });

  it("sends no description rather than an empty one", () => {
    assert.equal(draftFromForm(form({ ...COMPLETE, description: "   " })).description, null);
    assert.equal(draftFromForm(form({ ...COMPLETE, description: "" })).description, null);
  });

  it("defaults to draft when no state was chosen", () => {
    assert.equal(draftFromForm(form({ ...COMPLETE, status: "" })).status, "draft");
    assert.equal(draftFromForm(form({ code: "A", name: "B", domain: "C" })).status, "draft");
  });

  it("survives a form that carries nothing at all", () => {
    const draft = draftFromForm(form());
    assert.deepEqual(draft, {
      code: "",
      name: "",
      domain: "",
      description: null,
      status: "draft",
    });
  });
});

describe("missingFieldLabel", () => {
  it("passes a complete draft", () => {
    assert.equal(missingFieldLabel(draftFromForm(form(COMPLETE))), null);
  });

  it("does not ask for a grade", () => {
    // The regression this file was written for: a complete draft was refused
    // because the check still looked for a field the form had stopped
    // collecting.
    const draft = draftFromForm(form(COMPLETE));
    assert.equal(missingFieldLabel(draft), null);
    assert.ok(!REQUIRED_FIELDS.some((field) => field.name === "grade_id"));
    assert.ok(!REQUIRED_FIELDS.some((field) => field.label === "Grade"));
  });

  it("names the first field left blank, in the order they are asked for", () => {
    assert.equal(missingFieldLabel(draftFromForm(form({ ...COMPLETE, code: "" }))), "Code");
    assert.equal(missingFieldLabel(draftFromForm(form({ ...COMPLETE, name: "" }))), "Name");
    assert.equal(
      missingFieldLabel(draftFromForm(form({ ...COMPLETE, domain: "" }))),
      "Content strand",
    );
  });

  it("names the code first when several are blank", () => {
    const draft = draftFromForm(form({ code: "", name: "", domain: "" }));
    assert.equal(missingFieldLabel(draft), "Code");
  });

  it("refuses a field of only spaces", () => {
    assert.equal(missingFieldLabel(draftFromForm(form({ ...COMPLETE, name: "    " }))), "Name");
  });

  it("does not require a description", () => {
    assert.equal(
      missingFieldLabel(draftFromForm(form({ ...COMPLETE, description: "" }))),
      null,
    );
  });

  it("answers for a draft that is not one", () => {
    assert.equal(missingFieldLabel(null), "Code");
    assert.equal(missingFieldLabel(undefined), "Code");
    assert.equal(missingFieldLabel({}), "Code");
  });

  it("names every required field by a label the form actually shows", () => {
    // A label nobody can see on screen is not a usable error message.
    assert.deepEqual(
      REQUIRED_FIELDS.map((field) => field.label),
      ["Code", "Name", "Content strand"],
    );
  });
});
