/**
 * Unit tests for the activity transport.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  CLIENT_FAILURE,
  DEFAULT_PAGE_SIZE,
  createApiClient,
  pageQuery,
  readErrorEnvelope,
  readMeta,
} from "../services/api-client.js";

const BASE = "https://api.mathsmart.test";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * Creates a mock fetch function for transport tests.
 *
 * @param {object} options
 * @param {number} [options.status]
 * @param {any} [options.body]
 * @param {Error|null} [options.throws]
 * @param {boolean} [options.noJson]
 * @param {Error|null} [options.jsonThrows]
 * @returns {Array<{ url: string, options: any }>}
 */
function stubFetch({
  status = 200,
  body = null,
  throws = null,
  noJson = false,
  jsonThrows = null,
} = {}) {
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (throws) {
      throw throws;
    }
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => {
        if (jsonThrows) {
          throw jsonThrows;
        }
        if (noJson) {
          throw new SyntaxError("Unexpected token < in JSON");
        }
        return body;
      },
    };
  };

  return calls;
}

describe("createApiClient", () => {
  it("refuses to send anything when the API address is not configured", async () => {
    const calls = stubFetch({ body: { data: [] } });
    const client = createApiClient({ baseUrl: null, getAccessToken: async () => "token" });

    const result = await client.request("/teacher-admin/activities");

    assert.equal(result.ok, false);
    assert.equal(result.code, CLIENT_FAILURE.UNCONFIGURED);
    assert.equal(calls.length, 0);
  });

  it("reports an ended session instead of sending an unauthenticated request", async () => {
    const calls = stubFetch({ body: { data: [] } });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => null });

    const result = await client.request("/teacher-admin/activities");

    assert.equal(result.ok, false);
    assert.equal(result.code, CLIENT_FAILURE.NO_SESSION);
    assert.equal(calls.length, 0);
  });

  it("sends the bearer token and reads a collection envelope", async () => {
    const calls = stubFetch({
      body: {
        data: [{ activity_id: "act-1", title: "Practice 1" }],
        meta: { page: 1, page_size: 20, total_items: 1, total_pages: 1 },
      },
    });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "jwt_token" });

    const result = await client.request("/teacher-admin/activities");

    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.data.length, 1);
    assert.equal(result.meta.totalItems, 1);
    assert.equal(calls[0].options.headers.Authorization, "Bearer jwt_token");
  });

  it("sends a body as JSON when there is one", async () => {
    const calls = stubFetch({ body: { data: { activity_id: "act-new", title: "Created" } }, status: 201 });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "token" });

    const result = await client.request("/teacher-admin/activities", {
      method: "POST",
      body: { title: "Created" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 201);
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers["Content-Type"], "application/json");
    assert.equal(calls[0].options.body, JSON.stringify({ title: "Created" }));
  });

  it("strips a trailing slash from the base address", async () => {
    const calls = stubFetch({ body: { data: [] } });
    const client = createApiClient({ baseUrl: `${BASE}///`, getAccessToken: async () => "token" });

    await client.request("/teacher-admin/activities");

    assert.equal(calls[0].url, `${BASE}/teacher-admin/activities`);
  });

  it("treats a 204 archive as success with no body", async () => {
    stubFetch({ status: 204 });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "token" });

    const result = await client.request("/teacher-admin/activities/act-1", { method: "DELETE" });

    assert.equal(result.ok, true);
    assert.equal(result.status, 204);
    assert.equal(result.data, null);
    assert.equal(result.error, null);
  });

  it("reports a timeout as a timeout, not as an unreachable server", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    stubFetch({ throws: timeout });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "token" });

    const result = await client.request("/teacher-admin/activities");

    assert.equal(result.ok, false);
    assert.equal(result.code, CLIENT_FAILURE.TIMEOUT);
  });

  it("reports a response json timeout as a timeout", async () => {
    const jsonTimeout = new Error("The operation was aborted due to timeout");
    jsonTimeout.name = "TimeoutError";
    stubFetch({ jsonThrows: jsonTimeout });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "token" });

    const result = await client.request("/teacher-admin/activities");

    assert.equal(result.ok, false);
    assert.equal(result.code, CLIENT_FAILURE.TIMEOUT);
  });

  it("reports a failed connection as a network failure", async () => {
    stubFetch({ throws: new TypeError("fetch failed") });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "token" });

    const result = await client.request("/teacher-admin/activities");

    assert.equal(result.ok, false);
    assert.equal(result.code, CLIENT_FAILURE.NETWORK);
  });
});

describe("pageQuery", () => {
  it("omits an absent search and status rather than sending them empty", () => {
    const query = pageQuery({ page: 2, pageSize: 20 });
    assert.equal(query, "page=2&page_size=20");
  });

  it("trims the search and carries the status", () => {
    const query = pageQuery({ search: "  integers  ", status: "draft", page: 1, pageSize: 10 });
    assert.equal(query, "search=integers&status=draft&page=1&page_size=10");
  });

  it("includes module_id when provided", () => {
    const query = pageQuery({
      moduleId: "4a39d286-e93e-4e75-9644-b873fcac185c",
      page: 1,
      pageSize: 20,
    });
    assert.equal(query, "module_id=4a39d286-e93e-4e75-9644-b873fcac185c&page=1&page_size=20");
  });
});

describe("readMeta", () => {
  it("maps the documented envelope names onto the ones the UI uses", () => {
    const meta = readMeta({
      meta: { page: 3, page_size: 10, total_items: 25, total_pages: 3 },
    });
    assert.deepEqual(meta, {
      page: 3,
      pageSize: 10,
      totalItems: 25,
      totalPages: 3,
    });
  });

  it("returns null for a single-resource reply", () => {
    assert.equal(readMeta({ data: { activity_id: "act-1" } }), null);
  });
});

describe("readErrorEnvelope", () => {
  it("falls back to the status when the envelope carries no message", () => {
    const parsed = readErrorEnvelope({}, 500);
    assert.equal(parsed.error, "The request failed with status 500.");
  });

  it("reads an envelope's message and fields", () => {
    const parsed = readErrorEnvelope(
      {
        error: {
          code: "validation_error",
          message: "Title is required",
          fields: { title: "Required" },
          request_id: "req-1",
        },
      },
      422
    );
    assert.equal(parsed.code, "validation_error");
    assert.equal(parsed.error, "Title is required");
    assert.equal(parsed.fields.title, "Required");
    assert.equal(parsed.requestId, "req-1");
  });
});
