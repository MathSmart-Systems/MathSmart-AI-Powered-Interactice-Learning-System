/**
 * Unit tests for the Grades & Sections transport.
 *
 * These exercise the module's own decisions — what it refuses to send, which
 * headers it attaches, how it reads a reply, and how it turns a database
 * refusal into something a teacher can act on. The only thing mocked is
 * `fetch`, because a live server cannot be made to time out or answer with
 * broken JSON on demand.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAdviserDirectory,
  clarifySectionFailure,
  createDirectoryClient,
  directoryReadError,
  extractList,
  normalizeBaseUrl,
  sectionCreatePayload,
  sectionPatchPayload,
} from "../services/directory-transport.js";

const BASE = "https://api.mathsmart.test";

/**
 * A stubbed `fetch` plus the record of what it was asked to send.
 *
 * @param {object} options
 * @param {number} [options.status]
 * @param {any} [options.body]
 * @param {Error|null} [options.throws]
 * @param {Error|null} [options.jsonThrows]
 * @returns {{fetchImpl: Function, calls: Array<{url: string, options: any}>}}
 */
function stubFetch({ status = 200, body = null, throws = null, jsonThrows = null } = {}) {
  const calls = [];

  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (throws) throw throws;
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => {
        if (jsonThrows) throw jsonThrows;
        return body;
      },
    };
  };

  return { fetchImpl, calls };
}

/** A client with the given stub already wired in. */
function clientWith(stub, { baseUrl = BASE, token = "jwt_token" } = {}) {
  return createDirectoryClient({
    baseUrl,
    getAccessToken: async () => token,
    fetchImpl: stub.fetchImpl,
  });
}

describe("normalizeBaseUrl", () => {
  it("treats an unset address as no address at all", () => {
    assert.equal(normalizeBaseUrl(undefined), null);
    assert.equal(normalizeBaseUrl(null), null);
    assert.equal(normalizeBaseUrl(""), null);
  });

  it("refuses a non-string address rather than coercing it", () => {
    assert.equal(normalizeBaseUrl(8000), null);
    assert.equal(normalizeBaseUrl({ href: BASE }), null);
  });

  it("strips every trailing slash so paths never double up", () => {
    assert.equal(normalizeBaseUrl(`${BASE}///`), BASE);
    assert.equal(normalizeBaseUrl(BASE), BASE);
  });

  it("returns nothing for an address that is only slashes", () => {
    assert.equal(normalizeBaseUrl("///"), null);
  });
});

describe("createDirectoryClient", () => {
  it("refuses to send anything when the API address is not configured", async () => {
    const stub = stubFetch({ body: { data: [] } });
    const client = clientWith(stub, { baseUrl: null });

    const result = await client.request("GET", "/teacher-admin/grades");

    assert.equal(result.ok, false);
    assert.equal(result.status, null);
    assert.equal(result.error, "API not configured");
    assert.equal(stub.calls.length, 0);
  });

  it("reports an ended session instead of sending an unauthenticated request", async () => {
    const stub = stubFetch({ body: { data: [] } });
    const client = clientWith(stub, { token: null });

    const result = await client.request("GET", "/teacher-admin/grades");

    assert.equal(result.ok, false);
    assert.equal(result.error, "Session not available");
    assert.equal(stub.calls.length, 0);
  });

  it("sends the bearer token and asks for JSON", async () => {
    const stub = stubFetch({ body: { data: [] } });
    const client = clientWith(stub);

    await client.request("GET", "/teacher-admin/grades");

    assert.equal(stub.calls[0].url, `${BASE}/teacher-admin/grades`);
    assert.equal(stub.calls[0].options.headers.Authorization, "Bearer jwt_token");
    assert.equal(stub.calls[0].options.headers.Accept, "application/json");
    assert.equal(stub.calls[0].options.method, "GET");
  });

  it("never claims a JSON body on a request that carries none", async () => {
    const stub = stubFetch({ status: 204 });
    const client = clientWith(stub);

    await client.request("DELETE", "/teacher-admin/sections/sec-1");

    assert.equal(stub.calls[0].options.headers["Content-Type"], undefined);
    assert.equal(stub.calls[0].options.body, undefined);
  });

  it("serialises a body and declares its type", async () => {
    const stub = stubFetch({ status: 201, body: { data: { grade_id: "g-1" } } });
    const client = clientWith(stub);

    const result = await client.request("POST", "/teacher-admin/grades", {
      name: "Grade 6",
      level: 6,
      is_active: true,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 201);
    assert.deepEqual(result.data, { grade_id: "g-1" });
    assert.equal(stub.calls[0].options.headers["Content-Type"], "application/json");
    assert.equal(
      stub.calls[0].options.body,
      JSON.stringify({ name: "Grade 6", level: 6, is_active: true }),
    );
  });

  it("sends a body that is explicitly null rather than dropping it", async () => {
    const stub = stubFetch({ body: { data: {} } });
    const client = clientWith(stub);

    await client.request("PATCH", "/teacher-admin/sections/sec-1", { adviser_id: null });

    assert.equal(stub.calls[0].options.body, JSON.stringify({ adviser_id: null }));
  });

  it("never caches a directory read", async () => {
    const stub = stubFetch({ body: { data: [] } });
    const client = clientWith(stub);

    await client.request("GET", "/teacher-admin/sections");

    assert.equal(stub.calls[0].options.cache, "no-store");
  });

  it("treats a 204 deactivation as success with no body to read", async () => {
    const stub = stubFetch({ status: 204, jsonThrows: new Error("no body") });
    const client = clientWith(stub);

    const result = await client.request("DELETE", "/teacher-admin/grades/g-1");

    assert.equal(result.ok, true);
    assert.equal(result.status, 204);
    assert.equal(result.data, undefined);
  });

  it("unwraps the documented data envelope", async () => {
    const stub = stubFetch({ body: { data: [{ grade_id: "g-1", name: "Grade 6" }] } });
    const client = clientWith(stub);

    const result = await client.request("GET", "/teacher-admin/grades");

    assert.deepEqual(result.data, [{ grade_id: "g-1", name: "Grade 6" }]);
  });

  it("keeps a reply that carries no envelope", async () => {
    const stub = stubFetch({ body: [{ grade_id: "g-1" }] });
    const client = clientWith(stub);

    const result = await client.request("GET", "/teacher-admin/grades");

    assert.deepEqual(result.data, [{ grade_id: "g-1" }]);
  });

  it("prefers the API's own refusal message over the status code", async () => {
    const stub = stubFetch({
      status: 422,
      body: { error: { code: "validation_error", message: "Name is too short" } },
    });
    const client = clientWith(stub);

    const result = await client.request("POST", "/teacher-admin/grades", { name: "G" });

    assert.equal(result.ok, false);
    assert.equal(result.status, 422);
    assert.equal(result.error, "Name is too short");
  });

  it("falls back to FastAPI's detail when there is no error envelope", async () => {
    const stub = stubFetch({ status: 403, body: { detail: "Not permitted" } });
    const client = clientWith(stub);

    const result = await client.request("DELETE", "/teacher-admin/sections/sec-1");

    assert.equal(result.ok, false);
    assert.equal(result.error, "Not permitted");
  });

  it("falls back to the status when a refusal explains nothing", async () => {
    const stub = stubFetch({ status: 500, body: {} });
    const client = clientWith(stub);

    const result = await client.request("GET", "/teacher-admin/grades");

    assert.equal(result.ok, false);
    assert.equal(result.error, "Request failed with status 500");
  });

  it("reports a reply that is not JSON as a server error, not a parse crash", async () => {
    const stub = stubFetch({
      status: 502,
      jsonThrows: new SyntaxError("Unexpected token < in JSON"),
    });
    const client = clientWith(stub);

    const result = await client.request("GET", "/teacher-admin/sections");

    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.equal(result.error, "Server error (502)");
  });

  it("reports an unreachable server with the reason attached", async () => {
    const stub = stubFetch({ throws: new TypeError("fetch failed") });
    const client = clientWith(stub);

    const result = await client.request("GET", "/teacher-admin/grades");

    assert.equal(result.ok, false);
    assert.equal(result.status, null);
    assert.equal(result.error, "Service unavailable (fetch failed)");
  });

  it("reads the underlying cause when the outer failure says nothing useful", async () => {
    const outer = new Error("");
    outer.cause = new Error("ECONNREFUSED 127.0.0.1:8000");
    const stub = stubFetch({ throws: outer });
    const client = clientWith(stub);

    const result = await client.request("GET", "/teacher-admin/grades");

    assert.equal(result.error, "Service unavailable (ECONNREFUSED 127.0.0.1:8000)");
  });

  it("names a timeout as a timeout", async () => {
    const timeout = new Error("");
    timeout.name = "TimeoutError";
    const stub = stubFetch({ throws: timeout });
    const client = clientWith(stub);

    const result = await client.request("GET", "/teacher-admin/sections");

    assert.equal(result.ok, false);
    assert.equal(result.error, "Service unavailable (TimeoutError)");
  });

  it("asks for a fresh token on every request so a refreshed session is used", async () => {
    const stub = stubFetch({ body: { data: [] } });
    const tokens = ["first_token", "second_token"];
    const client = createDirectoryClient({
      baseUrl: BASE,
      getAccessToken: async () => tokens.shift(),
      fetchImpl: stub.fetchImpl,
    });

    await client.request("GET", "/teacher-admin/grades");
    await client.request("GET", "/teacher-admin/sections");

    assert.equal(stub.calls[0].options.headers.Authorization, "Bearer first_token");
    assert.equal(stub.calls[1].options.headers.Authorization, "Bearer second_token");
  });
});

describe("extractList", () => {
  it("returns the list from a plain array reply", () => {
    const result = extractList({ ok: true, data: [{ grade_id: "g-1" }] });
    assert.deepEqual(result.data, [{ grade_id: "g-1" }]);
    assert.equal(result.error, null);
  });

  it("reaches through a second envelope rather than returning an object as a list", () => {
    const result = extractList({ ok: true, data: { data: [{ section_id: "s-1" }] } });
    assert.deepEqual(result.data, [{ section_id: "s-1" }]);
  });

  it("gives an empty list, never undefined, when the reply carries no rows", () => {
    const result = extractList({ ok: true, data: { meta: { total_items: 0 } } });
    assert.deepEqual(result.data, []);
    assert.equal(result.error, null);
  });

  it("carries the failure through with an empty list so the view never maps undefined", () => {
    const result = extractList({ ok: false, error: "Session not available" });
    assert.deepEqual(result.data, []);
    assert.equal(result.error, "Session not available");
  });

  it("still reports a failure that arrived without a message", () => {
    const result = extractList({ ok: false });
    assert.equal(result.error, "Request failed");
  });
});

describe("sectionCreatePayload", () => {
  it("never sends a grade, because the server decides it", () => {
    const payload = sectionCreatePayload({
      name: "Rizal",
      is_active: true,
      grade_id: "a-grade-a-client-chose",
    });

    assert.equal("grade_id" in payload, false);
    assert.deepEqual(Object.keys(payload).sort(), ["is_active", "name"]);
  });

  it("omits an unassigned adviser instead of sending an empty string", () => {
    const payload = sectionCreatePayload({ name: "Rizal", adviser_id: "", is_active: true });

    assert.deepEqual(payload, { name: "Rizal", is_active: true });
    assert.equal("adviser_id" in payload, false);
  });

  it("omits an adviser choice that is only whitespace", () => {
    const payload = sectionCreatePayload({ name: "Rizal", adviser_id: "   ", is_active: true });

    assert.equal("adviser_id" in payload, false);
  });

  it("omits the adviser when the form never offered one", () => {
    assert.equal("adviser_id" in sectionCreatePayload({ name: "Rizal", is_active: true }), false);
  });

  it("keeps a chosen adviser", () => {
    const payload = sectionCreatePayload({
      name: "Rizal",
      adviser_id: "4a39d286-e93e-4e75-9644-b873fcac185c",
      is_active: true,
    });

    assert.equal(payload.adviser_id, "4a39d286-e93e-4e75-9644-b873fcac185c");
  });

  it("sends only the fields the API accepts, so an extra one cannot be refused", () => {
    const payload = sectionCreatePayload({
      name: "Rizal",
      is_active: true,
      section_id: "should-not-travel",
      created_at: "2026-01-01",
    });

    assert.deepEqual(Object.keys(payload).sort(), ["is_active", "name"]);
  });

  it("carries an inactive choice through rather than defaulting it to active", () => {
    assert.equal(sectionCreatePayload({ name: "Rizal", is_active: false }).is_active, false);
  });
});

describe("sectionPatchPayload", () => {
  it("never sends a grade, so a section cannot be moved out of Grade 6", () => {
    const patch = sectionPatchPayload({ name: "Rizal", grade_id: "another-grade" });

    assert.equal("grade_id" in patch, false);
    assert.deepEqual(patch, { name: "Rizal" });
  });

  it("clears an adviser explicitly, because an absent key would keep the old one", () => {
    const patch = sectionPatchPayload({ name: "Rizal", adviser_id: "" });

    assert.equal(patch.adviser_id, null);
    assert.equal("adviser_id" in patch, true);
  });

  it("clears an adviser choice that is only whitespace", () => {
    assert.equal(sectionPatchPayload({ adviser_id: "  " }).adviser_id, null);
  });

  it("leaves the adviser untouched when the change does not mention it", () => {
    const patch = sectionPatchPayload({ is_active: true });

    assert.equal("adviser_id" in patch, false);
    assert.deepEqual(patch, { is_active: true });
  });

  it("keeps a chosen adviser", () => {
    const patch = sectionPatchPayload({ adviser_id: "4a39d286-e93e-4e75-9644-b873fcac185c" });

    assert.equal(patch.adviser_id, "4a39d286-e93e-4e75-9644-b873fcac185c");
  });

  it("normalises a null adviser to null rather than leaving an unusable value", () => {
    assert.equal(sectionPatchPayload({ adviser_id: null }).adviser_id, null);
  });

  it("does not mutate the change it was given", () => {
    const original = { name: "Rizal", adviser_id: "", grade_id: "g6" };
    sectionPatchPayload(original);

    assert.equal(original.adviser_id, "");
    assert.equal(original.grade_id, "g6");
  });
});

describe("clarifySectionFailure", () => {
  it("explains a broken adviser reference in the teacher's terms", () => {
    const result = clarifySectionFailure({
      ok: false,
      error: 'insert violates foreign key constraint "sections_adviser_id_fkey"',
    });

    assert.equal(
      result.error,
      "The selected adviser is invalid or has been removed. Please choose another or leave unassigned.",
    );
  });

  it("explains a broken grade reference in the teacher's terms", () => {
    const result = clarifySectionFailure({
      ok: false,
      error: 'insert violates foreign key constraint "sections_grade_id_fkey"',
    });

    assert.equal(
      result.error,
      "The selected grade level is invalid. Please refresh the page and try again.",
    );
  });

  it("leaves a successful result exactly as it was", () => {
    const success = { ok: true, status: 201, data: { section_id: "s-1" } };

    assert.deepEqual(clarifySectionFailure(success), success);
  });

  it("leaves a refusal it cannot improve on alone", () => {
    const result = clarifySectionFailure({ ok: false, error: "Name is too short" });

    assert.equal(result.error, "Name is too short");
  });

  it("leaves a constraint failure that names neither field alone", () => {
    const message = 'duplicate key value violates unique constraint "sections_name_key"';
    const result = clarifySectionFailure({ ok: false, error: message });

    assert.equal(result.error, message);
  });

  it("survives a failure that carries no message at all", () => {
    const result = clarifySectionFailure({ ok: false, status: null });

    assert.equal(result.ok, false);
    assert.equal(result.error, undefined);
  });

  it("keeps the status alongside the rewritten message", () => {
    const result = clarifySectionFailure({
      ok: false,
      status: 409,
      error: "violates foreign key on adviser",
    });

    assert.equal(result.status, 409);
  });
});

describe("buildAdviserDirectory", () => {
  // A section's adviser_id references teacher_admin_profiles.teacher_admin_id,
  // which is a different value from the account's user_id. Sending the account
  // id broke the foreign key, and the 500 that came back carried no CORS
  // headers, so the browser could only say "Failed to fetch".
  const ACCOUNT_ID = "b0000000-0000-4000-8000-00000000000e";
  const ADVISER_ID = "4a39d286-e93e-4e75-9644-b873fcac185c";

  const adviser = {
    user_id: ACCOUNT_ID,
    teacher_admin_id: ADVISER_ID,
    role: "teacher_admin",
    account_status: "active",
    full_name: "Maria Santos",
  };

  it("keys an adviser by the id a section actually points at", () => {
    assert.deepEqual(buildAdviserDirectory([adviser]), { [ADVISER_ID]: "Maria Santos" });
  });

  it("never keys an adviser by their account id", () => {
    const directory = buildAdviserDirectory([adviser]);

    assert.equal(ACCOUNT_ID in directory, false);
    assert.equal(Object.keys(directory)[0], ADVISER_ID);
  });

  it("leaves out an account with no teacher_admin profile to be assigned by", () => {
    assert.deepEqual(buildAdviserDirectory([{ ...adviser, teacher_admin_id: null }]), {});
    assert.deepEqual(buildAdviserDirectory([{ ...adviser, teacher_admin_id: undefined }]), {});
  });

  it("leaves out a learner, who cannot advise a section", () => {
    assert.deepEqual(buildAdviserDirectory([{ ...adviser, role: "student" }]), {});
  });

  it("leaves out an account that is no longer active", () => {
    assert.deepEqual(buildAdviserDirectory([{ ...adviser, account_status: "disabled" }]), {});
  });

  it("leaves out an account with no usable name rather than offering a blank choice", () => {
    assert.deepEqual(buildAdviserDirectory([{ ...adviser, full_name: "   " }]), {});
    assert.deepEqual(buildAdviserDirectory([{ ...adviser, full_name: null }]), {});
    assert.deepEqual(buildAdviserDirectory([{ ...adviser, full_name: undefined }]), {});
  });

  it("trims the surrounding whitespace off a name", () => {
    const directory = buildAdviserDirectory([{ ...adviser, full_name: "  Maria Santos  " }]);

    assert.equal(directory[ADVISER_ID], "Maria Santos");
  });

  it("keeps the eligible advisers and drops the rest from the same page", () => {
    const directory = buildAdviserDirectory([
      adviser,
      { ...adviser, teacher_admin_id: "b-2", role: "student" },
      { ...adviser, teacher_admin_id: "c-3", full_name: "Jose Cruz" },
      { ...adviser, teacher_admin_id: null, full_name: "No Profile" },
      null,
    ]);

    assert.deepEqual(Object.keys(directory).sort(), [ADVISER_ID, "c-3"]);
  });

  it("gives an empty directory when the account read failed", () => {
    assert.deepEqual(buildAdviserDirectory(undefined), {});
    assert.deepEqual(buildAdviserDirectory(null), {});
    assert.deepEqual(buildAdviserDirectory({ data: [adviser] }), {});
  });
});

describe("directoryReadError", () => {
  it("reports nothing when both lists answered", () => {
    assert.equal(directoryReadError(true, true), undefined);
  });

  it("keeps the page usable when only one list failed", () => {
    assert.equal(directoryReadError(true, false), undefined);
    assert.equal(directoryReadError(false, true), undefined);
  });

  it("reports an unavailable directory only when neither list answered", () => {
    assert.equal(directoryReadError(false, false), "unavailable");
  });
});
