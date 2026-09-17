/**
 * Unit tests for the learner-visibility warning authors see.
 *
 * They run on Node's own test runner (`npm run test:unit`), which is why the
 * import uses an explicit `.js` extension: it is what lets this pure logic be
 * exercised without a bundler, a browser, or a dependency the project does not
 * already have.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { moduleVisibilityWarning } from "../utils/module-visibility.js";

describe("moduleVisibilityWarning", () => {
  it("stays silent for a draft module", () => {
    assert.equal(moduleVisibilityWarning({ moduleStatus: "draft", competencyStatus: "draft" }), null);
    assert.equal(moduleVisibilityWarning({ moduleStatus: "draft", competencyStatus: "published" }), null);
  });

  it("stays silent for an archived module", () => {
    assert.equal(
      moduleVisibilityWarning({ moduleStatus: "archived", competencyStatus: "draft" }),
      null,
    );
  });

  it("stays silent once the module and its competency are published", () => {
    assert.equal(
      moduleVisibilityWarning({ moduleStatus: "published", competencyStatus: "published" }),
      null,
    );
  });

  it("explains a published module whose competency is a draft", () => {
    const warning = moduleVisibilityWarning({ moduleStatus: "published", competencyStatus: "draft" });
    assert.match(warning, /Learners can't open this yet/);
    assert.match(warning, /competency is a draft/);
  });

  it("explains a published module whose competency is archived", () => {
    const warning = moduleVisibilityWarning({
      moduleStatus: "published",
      competencyStatus: "archived",
    });
    assert.match(warning, /Learners can't open this yet/);
    assert.match(warning, /competency is archived/);
  });

  it("stays silent when the competency status is unknown, rather than guessing", () => {
    assert.equal(moduleVisibilityWarning({ moduleStatus: "published", competencyStatus: null }), null);
    assert.equal(moduleVisibilityWarning({ moduleStatus: "published", competencyStatus: undefined }), null);
  });
});