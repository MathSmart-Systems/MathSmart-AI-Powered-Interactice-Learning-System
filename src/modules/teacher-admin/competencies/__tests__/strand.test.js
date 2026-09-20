/**
 * The content strand list, and the strand that is not on it.
 *
 * The rule these tests exist to hold: the option list is fixed at the five
 * DepEd strands plus "Other", and nothing anybody types can change it. A
 * strand written under "Other" is saved on that one competency — shown on its
 * card, prefilled when it is edited — and is never promoted into a choice the
 * next competency can pick.
 *
 * They also protect something older and quieter. The form used to fall back to
 * the first strand whenever a competency's stored strand was not one of the
 * five, so opening a competency to fix its code and pressing save moved it to
 * Numbers and Number Sense without saying so.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COMPETENCY_DOMAINS, DEFAULT_DOMAIN } from "../utils/constants.js";
import {
  OTHER_STRAND,
  STRAND_MAX,
  STRAND_OPTIONS,
  initialStrand,
} from "../utils/strand.js";

describe("STRAND_OPTIONS", () => {
  it("is the five DepEd strands and Other, in that order", () => {
    assert.deepEqual(
      STRAND_OPTIONS.map((option) => option.label),
      [...COMPETENCY_DOMAINS, "Other"],
    );
  });

  it("offers exactly six options and no more", () => {
    assert.equal(STRAND_OPTIONS.length, 6);
  });

  it("ends on Other, so the escape hatch is last", () => {
    assert.deepEqual(STRAND_OPTIONS.at(-1), { value: OTHER_STRAND, label: "Other" });
  });

  it("labels every DepEd strand with its own name", () => {
    for (const domain of COMPETENCY_DOMAINS) {
      assert.deepEqual(
        STRAND_OPTIONS.find((option) => option.value === domain),
        { value: domain, label: domain },
      );
    }
  });

  it("cannot be added to", () => {
    // The whole point: a custom strand stays on its own competency. If this
    // list could grow, one typo would become a permanent curriculum entry.
    assert.ok(Object.isFrozen(STRAND_OPTIONS));
    assert.throws(() => {
      STRAND_OPTIONS.push({ value: "HEHE", label: "HEHE" });
    }, TypeError);
    assert.equal(STRAND_OPTIONS.length, 6);
  });

  it("cannot have an option rewritten", () => {
    assert.ok(STRAND_OPTIONS.every((option) => Object.isFrozen(option)));
    assert.throws(() => {
      STRAND_OPTIONS[0].label = "HEHE";
    }, TypeError);
    assert.equal(STRAND_OPTIONS[0].label, COMPETENCY_DOMAINS[0]);
  });

  it("does not offer a custom strand back, however many competencies carry it", () => {
    // `initialStrand` is the only thing that reads a stored strand, and it
    // reads one competency at a time. Nothing accumulates.
    for (const stored of ["HEHE", "HEHE", "Financial Literacy"]) {
      initialStrand(stored);
    }
    assert.deepEqual(
      STRAND_OPTIONS.map((option) => option.label),
      [...COMPETENCY_DOMAINS, "Other"],
    );
  });
});

describe("initialStrand", () => {
  it("starts a new competency on the first strand, not on Other", () => {
    assert.deepEqual(initialStrand(""), { selection: DEFAULT_DOMAIN, custom: "" });
    assert.deepEqual(initialStrand(undefined), { selection: DEFAULT_DOMAIN, custom: "" });
  });

  it("selects the competency's own strand when it is one of the five", () => {
    for (const domain of COMPETENCY_DOMAINS) {
      assert.deepEqual(initialStrand(domain), { selection: domain, custom: "" });
    }
  });

  it("opens Other with the custom strand prefilled, rather than replacing it", () => {
    // The regression: editing a competency in a custom strand used to
    // reassign it to the first strand on save.
    assert.deepEqual(initialStrand("HEHE"), {
      selection: OTHER_STRAND,
      custom: "HEHE",
    });
  });

  it("treats a strand of only spaces as no strand at all", () => {
    assert.deepEqual(initialStrand("    "), { selection: DEFAULT_DOMAIN, custom: "" });
  });

  it("trims a stored strand before matching it against the five", () => {
    assert.deepEqual(initialStrand("  Geometry  "), {
      selection: "Geometry",
      custom: "",
    });
  });

  it("trims a custom strand too", () => {
    assert.deepEqual(initialStrand("  HEHE  "), {
      selection: OTHER_STRAND,
      custom: "HEHE",
    });
  });

  it("cuts a stored strand longer than the field accepts", () => {
    // Older rows predate the limit. Prefilling more than the field allows
    // gives a form that cannot be saved and does not say why.
    const long = "H".repeat(STRAND_MAX + 40);
    const { selection, custom } = initialStrand(long);
    assert.equal(selection, OTHER_STRAND);
    assert.equal(custom.length, STRAND_MAX);
  });

  it("shows a stored strand verbatim, even one that reads like the sentinel", () => {
    // `domain` is free text on the API, so a row really could hold
    // `__other__`. It is that competency's strand, so the field shows it
    // rather than blanking a value nobody asked to lose.
    assert.deepEqual(initialStrand(OTHER_STRAND), {
      selection: OTHER_STRAND,
      custom: OTHER_STRAND,
    });
  });

  it("answers for a strand that is not text", () => {
    assert.equal(initialStrand(null).selection, DEFAULT_DOMAIN);
    assert.equal(initialStrand(6).selection, DEFAULT_DOMAIN);
    assert.equal(initialStrand({}).selection, DEFAULT_DOMAIN);
  });
});

describe("STRAND_MAX", () => {
  it("matches what the API stores", () => {
    // `StringConstraints(max_length=120)` in admin_schemas.py. A form that
    // accepts more only moves the refusal to the server.
    assert.equal(STRAND_MAX, 120);
  });
});
