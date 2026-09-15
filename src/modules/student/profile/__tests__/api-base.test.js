import test from "node:test";
import assert from "node:assert/strict";

import { apiBaseUrl } from "../services/api-base.js";

test("apiBaseUrl accepts HTTPS production and loopback HTTP bases", () => {
  assert.equal(apiBaseUrl("https://api.mathsmart.example/api/v1/"), "https://api.mathsmart.example/api/v1");
  assert.equal(apiBaseUrl("http://localhost:8000/api/v1"), "http://localhost:8000/api/v1");
  assert.equal(apiBaseUrl("http://127.0.0.1:8000/api/v1/"), "http://127.0.0.1:8000/api/v1");
});

test("apiBaseUrl trims trailing slashes", () => {
  assert.equal(apiBaseUrl("https://api.mathsmart.example/api/v1///"), "https://api.mathsmart.example/api/v1");
});

test("apiBaseUrl rejects cleartext non-loopback production URLs", () => {
  assert.equal(apiBaseUrl("http://api.mathsmart.example/api/v1"), null);
  assert.equal(apiBaseUrl("http://mathsmart.example.com"), null);
});

test("apiBaseUrl rejects missing, empty, and invalid values", () => {
  assert.equal(apiBaseUrl(undefined), null);
  assert.equal(apiBaseUrl(""), null);
  assert.equal(apiBaseUrl("not-a-url"), null);
  assert.equal(apiBaseUrl("/api/v1"), null);
});