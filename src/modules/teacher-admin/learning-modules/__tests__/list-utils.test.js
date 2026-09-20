import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { secureApiBaseUrl } from "../utils/api-url.js";
import { formatDate, rangeLabel } from "../utils/format.js";
import { learningModulesUrl } from "../utils/urls.js";

describe("secureApiBaseUrl", () => {
  it("accepts HTTPS for approved API hosts and explicit HTTP loopback URLs", () => {
    assert.equal(secureApiBaseUrl("https://api.mathsmart.test/api/v1/"), "https://api.mathsmart.test/api/v1");
    assert.equal(secureApiBaseUrl("http://localhost:8000/api/v1"), "http://localhost:8000/api/v1");
    assert.equal(secureApiBaseUrl("http://127.0.0.1:8000/api/v1/"), "http://127.0.0.1:8000/api/v1");
  });

  it("rejects unapproved, insecure remote, and invalid URLs", () => {
    assert.equal(secureApiBaseUrl("https://api.mathsmart.test.attacker.example/api/v1"), null);
    assert.equal(secureApiBaseUrl("https://attacker.example/api/v1"), null);
    assert.equal(secureApiBaseUrl("http://api.mathsmart.test/api/v1"), null);
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

describe("rangeLabel", () => {
  it("names the state it is counting, because the list shows only that state", () => {
    assert.equal(
      rangeLabel({ page: 2, pageSize: 10, totalItems: 23, statusLabel: "Published" }),
      "Showing 11–20 of 23 published modules",
    );
  });

  it("stops the last page at the total", () => {
    assert.equal(
      rangeLabel({ page: 3, pageSize: 10, totalItems: 23, statusLabel: "Draft" }),
      "Showing 21–23 of 23 draft modules",
    );
  });

  it("says nothing is there rather than counting to zero", () => {
    assert.equal(
      rangeLabel({ page: 1, pageSize: 10, totalItems: 0, statusLabel: "Archived" }),
      "No archived modules",
    );
  });
});
