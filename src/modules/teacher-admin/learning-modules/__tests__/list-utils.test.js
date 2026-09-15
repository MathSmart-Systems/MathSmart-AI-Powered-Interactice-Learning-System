import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { secureApiBaseUrl } from "../utils/api-url.js";
import { formatDate } from "../utils/format.js";
import { learningModulesUrl } from "../utils/urls.js";

describe("secureApiBaseUrl", () => {
  it("accepts HTTPS and the explicit HTTP localhost development URL", () => {
    assert.equal(secureApiBaseUrl("https://api.mathsmart.test/api/v1/"), "https://api.mathsmart.test/api/v1");
    assert.equal(secureApiBaseUrl("http://localhost:8000/api/v1"), "http://localhost:8000/api/v1");
  });

  it("rejects insecure remote and invalid URLs", () => {
    assert.equal(secureApiBaseUrl("http://api.mathsmart.test/api/v1"), null);
    assert.equal(secureApiBaseUrl("http://127.0.0.1:8000/api/v1"), null);
    assert.equal(secureApiBaseUrl("not a URL"), null);
  });
});

describe("learningModulesUrl", () => {
  it("preserves search and status while changing pages", () => {
    assert.equal(
      learningModulesUrl({ search: "signed numbers", status: "draft", page: 3 }),
      "/teacher/learning-modules?search=signed+numbers&status=draft&page=3",
    );
  });
});

describe("formatDate", () => {
  it("uses the Philippine calendar date", () => {
    assert.equal(formatDate("2026-09-13T17:00:00.000Z"), "Sep 14, 2026");
  });
});
