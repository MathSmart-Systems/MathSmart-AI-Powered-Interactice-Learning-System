/**
 * Unit tests for the assessment transport.
 *
 * Every case here is one the workspace has to render: a page of assessments, a
 * refusal the server explained field by field, a rate limit, a timeout, a reply
 * that is not JSON at all. The stub is a plain function, so none of it needs a
 * server, a token, or a network.
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

/** A `fetch` that answers with one canned reply, and records the call. */
function stubFetch({ status = 200, body = null, throws = null, noJson = false } = {}) {
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

    const result = await client.request("/teacher-admin/assessments");

    assert.equal(result.ok, false);
    assert.equal(result.code, CLIENT_FAILURE.UNCONFIGURED);
    assert.equal(calls.length, 0);
  });

  it("reports an ended session instead of sending an unauthenticated request", async () => {
    const calls = stubFetch({ body: { data: [] } });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => null });

    const result = await client.request("/teacher-admin/assessments");

    assert.equal(result.ok, false);
    assert.equal(result.code, CLIENT_FAILURE.NO_SESSION);
    assert.equal(calls.length, 0);
  });

  it("sends the bearer token and reads a collection envelope", async () => {
    const calls = stubFetch({
      body: {
        data: [{ assessment_id: "a1", title: "Diagnostic", question_count: 3 }],
        meta: { page: 2, page_size: 20, total_items: 21, total_pages: 2 },
      },
    });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "session-token" });

    const result = await client.request("/teacher-admin/assessments?page=2");

    assert.equal(result.ok, true);
    assert.equal(result.data.length, 1);
    assert.equal(result.meta.page, 2);
    assert.equal(result.meta.totalItems, 21);
    assert.equal(result.meta.totalPages, 2);

    assert.equal(calls[0].url, `${BASE}/teacher-admin/assessments?page=2`);
    assert.equal(calls[0].options.headers.Authorization, "Bearer session-token");
    // A GET carries no content type, because it carries no body.
    assert.equal(calls[0].options.headers["Content-Type"], undefined);
    assert.equal(calls[0].options.body, undefined);
  });

  it("takes the caller's own token over the session's", async () => {
    const calls = stubFetch({ body: { data: [] } });
    const client = createApiClient({
      baseUrl: BASE,
      getAccessToken: async () => "session-token",
    });

    await client.request("/teacher-admin/assessments", { token: "explicit-token" });

    assert.equal(calls[0].options.headers.Authorization, "Bearer explicit-token");
  });

  it("sends a body as JSON when there is one", async () => {
    const calls = stubFetch({ body: { data: { assessment_id: "a1" } } });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "token" });

    await client.request("/teacher-admin/assessments", {
      method: "POST",
      body: { title: "Diagnostic" },
    });

    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers["Content-Type"], "application/json");
    assert.equal(calls[0].options.body, JSON.stringify({ title: "Diagnostic" }));
  });

  it("strips a trailing slash from the base address", async () => {
    const calls = stubFetch({ body: { data: [] } });
    const client = createApiClient({
      baseUrl: `${BASE}/`,
      getAccessToken: async () => "token",
    });

    await client.request("/teacher-admin/assessments");

    assert.equal(calls[0].url, `${BASE}/teacher-admin/assessments`);
  });

  it("reads a refusal's message, code, fields and request id", async () => {
    stubFetch({
      status: 422,
      body: {
        error: {
          code: "validation_error",
          message: "The assessment could not be saved.",
          fields: { title: "Use at least 2 characters." },
          request_id: "req_9f2",
        },
      },
    });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "token" });

    const result = await client.request("/teacher-admin/assessments", { method: "POST", body: {} });

    assert.equal(result.ok, false);
    assert.equal(result.status, 422);
    assert.equal(result.error, "The assessment could not be saved.");
    assert.equal(result.code, "validation_error");
    assert.equal(result.fields.title, "Use at least 2 characters.");
    assert.equal(result.requestId, "req_9f2");
  });

  it("still reports a failure whose envelope is missing", async () => {
    // A proxy or gateway refusing before the API sees the request answers
    // without this project's envelope. The teacher still needs a sentence.
    stubFetch({ status: 502, body: { detail: "Bad Gateway" }, noJson: true });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "token" });

    const result = await client.request("/teacher-admin/assessments");

    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.match(result.error, /502/);
  });

  it("treats a 204 archive as success with no body", async () => {
    stubFetch({ status: 204 });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "token" });

    const result = await client.request("/teacher-admin/assessments/a1", { method: "DELETE" });

    assert.equal(result.ok, true);
    assert.equal(result.status, 204);
    assert.equal(result.data, null);
  });

  it("reports a malformed success reply rather than passing it on", async () => {
    stubFetch({ status: 200, body: { assessments: [] }, noJson: true });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "token" });

    const result = await client.request("/teacher-admin/assessments");

    assert.equal(result.ok, false);
    assert.equal(result.code, CLIENT_FAILURE.MALFORMED);
  });

  it("reports a success reply that carries no data key", async () => {
    stubFetch({ status: 200, body: { meta: { page: 1 } } });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "token" });

    const result = await client.request("/teacher-admin/assessments");

    assert.equal(result.ok, false);
    assert.equal(result.code, CLIENT_FAILURE.MALFORMED);
  });

  it("reports a timeout as a timeout, not as an unreachable server", async () => {
    stubFetch({ throws: Object.assign(new Error("timed out"), { name: "TimeoutError" }) });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "token" });

    const result = await client.request("/teacher-admin/assessments");

    assert.equal(result.ok, false);
    assert.equal(result.code, CLIENT_FAILURE.TIMEOUT);
    assert.match(result.error, /took too long/);
  });

  it("reports a failed connection as a network failure", async () => {
    stubFetch({ throws: new TypeError("Failed to fetch") });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: async () => "token" });

    const result = await client.request("/teacher-admin/assessments");

    assert.equal(result.ok, false);
    assert.equal(result.code, CLIENT_FAILURE.NETWORK);
  });

  it("gives every result the same set of keys", async () => {
    // A caller that reads `result.fields` should not have to check first.
    stubFetch({ body: { data: [] } });
    const ok = await createApiClient({
      baseUrl: BASE,
      getAccessToken: async () => "token",
    }).request("/teacher-admin/assessments");

    const refused = await createApiClient({ baseUrl: null }).request("/teacher-admin/assessments");

    const keys = ["ok", "status", "data", "meta", "error", "code", "fields"];
    for (const key of keys) {
      assert.ok(key in ok, `success result is missing ${key}`);
      assert.ok(key in refused, `failure result is missing ${key}`);
    }
  });
});

describe("pageQuery", () => {
  it("omits an absent search and status rather than sending them empty", () => {
    // `status=` would be a 422: the API types it as an enum.
    assert.equal(pageQuery({ search: "", status: null, page: 1, pageSize: 20 }), "page=1&page_size=20");
    assert.equal(
      pageQuery({ search: "   ", status: null, page: 1, pageSize: 20 }),
      "page=1&page_size=20"
    );
  });

  it("trims the search and carries the status", () => {
    const query = pageQuery({ search: "  unit quiz  ", status: "draft", page: 2, pageSize: 20 });
    assert.match(query, /search=unit\+quiz/);
    assert.match(query, /status=draft/);
    assert.match(query, /page=2/);
  });

  it("defaults the page size to the documented one", () => {
    assert.equal(DEFAULT_PAGE_SIZE, 20);
  });
});

describe("readMeta", () => {
  it("maps the documented envelope names onto the ones the UI uses", () => {
    const meta = readMeta({ meta: { page: 3, page_size: 50, total_items: 101, total_pages: 3 } });
    assert.deepEqual(meta, { page: 3, pageSize: 50, totalItems: 101, totalPages: 3 });
  });

  it("returns null for a single-resource reply", () => {
    assert.equal(readMeta({ data: {} }), null);
    assert.equal(readMeta(null), null);
  });

  it("falls back rather than reporting a missing page as zero", () => {
    const meta = readMeta({ meta: {} });
    assert.equal(meta.page, 1);
    assert.equal(meta.pageSize, DEFAULT_PAGE_SIZE);
    assert.equal(meta.totalItems, 0);
  });
});

describe("readErrorEnvelope", () => {
  it("falls back to the status when the envelope carries no message", () => {
    const read = readErrorEnvelope({ error: {} }, 500);
    assert.match(read.error, /500/);
    assert.equal(read.code, null);
    assert.deepEqual(read.fields, {});
  });

  it("ignores a fields value that is not an object", () => {
    const read = readErrorEnvelope({ error: { message: "No.", fields: "title" } }, 422);
    assert.deepEqual(read.fields, {});
  });
});
