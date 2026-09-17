/**
 * Unit tests for the settings transport.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CLIENT_FAILURE, createApiClient, readErrorEnvelope } from "../services/api-client.js";

const BASE = "https://api.mathsmart.test";

describe("settings api client", () => {
  it("fails fast when unconfigured", async () => {
    const client = createApiClient({ baseUrl: "" });
    const result = await client.request("/teacher-admin/settings");

    assert.equal(result.ok, false);
    assert.equal(result.code, CLIENT_FAILURE.UNCONFIGURED);
  });

  it("fails fast when session token is missing", async () => {
    const client = createApiClient({
      baseUrl: BASE,
      getAccessToken: async () => null,
    });
    const result = await client.request("/teacher-admin/settings");

    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.equal(result.code, CLIENT_FAILURE.NO_SESSION);
  });

  it("sends authenticated GET request successfully", async () => {
    const mockData = {
      thresholds: { activity_pass_percentage: 75 },
      intervention: { unsuccessful_attempts: 2 },
      groq: { enabled: true, model: "groq/compound-mini" },
    };

    const mockFetch = async (url, options) => {
      assert.equal(url, `${BASE}/teacher-admin/settings`);
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Authorization, "Bearer valid-token");
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: mockData }),
        headers: new Map([["x-request-id", "req-123"]]),
      };
    };

    const client = createApiClient({
      baseUrl: BASE,
      getAccessToken: async () => "valid-token",
      fetchImpl: mockFetch,
    });

    const result = await client.request("/teacher-admin/settings");
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, mockData);
  });

  it("sends audit events query request with action filter", async () => {
    const mockEvents = [
      {
        id: "evt-1",
        action: "settings.updated",
        actor_role: "teacher_admin",
        details: { updated_keys: ["thresholds.activity_pass_percentage"] },
        occurred_at: "2026-09-17T12:00:00Z",
      },
    ];

    const mockFetch = async (url, options) => {
      assert.equal(url, `${BASE}/teacher-admin/audit-events?action=settings.updated&page_size=5`);
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Authorization, "Bearer valid-token");
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: mockEvents, meta: { page: 1, page_size: 5 } }),
        headers: new Map(),
      };
    };

    const client = createApiClient({
      baseUrl: BASE,
      getAccessToken: async () => "valid-token",
      fetchImpl: mockFetch,
    });

    const result = await client.request(
      "/teacher-admin/audit-events?action=settings.updated&page_size=5"
    );
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, mockEvents);
  });

  it("handles validation failure envelope on PATCH", async () => {

    const mockFetch = async () => ({
      ok: false,
      status: 422,
      text: async () =>
        JSON.stringify({
          error: {
            code: "validation_error",
            message: "Passing threshold must be between 60 and 90.",
            fields: { "thresholds.activity_pass_percentage": "Out of range" },
            request_id: "req-err",
          },
        }),
      headers: new Map(),
    });

    const client = createApiClient({
      baseUrl: BASE,
      getAccessToken: async () => "valid-token",
      fetchImpl: mockFetch,
    });

    const result = await client.request("/teacher-admin/settings", {
      method: "PATCH",
      body: { settings: { "thresholds.activity_pass_percentage": 50 } },
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 422);
    assert.equal(result.code, "validation_error");
    assert.equal(result.error, "Passing threshold must be between 60 and 90.");
  });

  it("handles network failures gracefully", async () => {
    const mockFetch = async () => {
      throw new Error("Network offline");
    };

    const client = createApiClient({
      baseUrl: BASE,
      getAccessToken: async () => "valid-token",
      fetchImpl: mockFetch,
    });

    const result = await client.request("/teacher-admin/settings");
    assert.equal(result.ok, false);
    assert.equal(result.code, CLIENT_FAILURE.NETWORK);
  });
});

describe("readErrorEnvelope", () => {
  it("extracts structured error fields", () => {
    const envelope = {
      error: {
        message: "Invalid field",
        code: "invalid_field",
        fields: { title: "Required" },
        request_id: "req-1",
      },
    };
    const parsed = readErrorEnvelope(envelope, 400);
    assert.equal(parsed.error, "Invalid field");
    assert.equal(parsed.code, "invalid_field");
    assert.deepEqual(parsed.fields, { title: "Required" });
    assert.equal(parsed.requestId, "req-1");
  });

  it("falls back cleanly when message is missing", () => {
    const parsed = readErrorEnvelope({}, 500);
    assert.equal(parsed.error, "The request failed with status 500.");
  });
});
