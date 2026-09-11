import test from "node:test";
import assert from "node:assert/strict";

import { getApiUrl, parseApiBaseUrl } from "../api.js";

test("API config accepts local HTTP and remote HTTPS base URLs", () => {
  assert.equal(parseApiBaseUrl("http://localhost:8000/api/v1/"), "http://localhost:8000/api/v1");
  assert.equal(parseApiBaseUrl("http://127.0.0.1:8000/api/v1"), "http://127.0.0.1:8000/api/v1");
  assert.equal(parseApiBaseUrl("https://api.example.test/api/v1"), "https://api.example.test/api/v1");
});

test("API config rejects missing, unsafe, and malformed values", () => {
  for (const value of [
    "",
    "not-a-url",
    "/api/v1",
    "http://api.example.test/api/v1",
    "https://api.example.test/",
    "https://user:pass@api.example.test/api/v1",
    "https://api.example.test/api/v1?debug=true",
  ]) {
    assert.equal(parseApiBaseUrl(value), null, value);
  }
});

test("getApiUrl rejects invalid API config and paths", () => {
  assert.throws(() => getApiUrl("/health"), /not configured/);
});
