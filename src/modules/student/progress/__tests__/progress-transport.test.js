import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PROGRESS_STATE,
  readProgressFromApi,
} from "../services/progress-transport.js";

const BASE = "https://api.mathsmart.test/api/v1";
const STUDENT_ID = "58000000-0000-4000-8000-000000000001";

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

function transport(overrides = {}) {
  const calls = [];
  const bodies = {
    "/students/me": { data: { student_id: STUDENT_ID, full_name: "Juan Dela Cruz", diagnostic_status: "completed" } },
    "/progress/me": { data: {
      student_id: STUDENT_ID,
      overall_mastery: 72,
      diagnostic_score: 50,
      growth: 22,
      competencies: [],
      recent_activity: [],
    } },
    "/learning-path/me": { data: [] },
    ...overrides,
  };

  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const path = new URL(url).pathname.replace("/api/v1", "");
      const value = bodies[path];
      if (value instanceof Error) throw value;
      return value?.ok !== undefined ? value : response(value);
    },
  };
}

describe("student progress transport", () => {
  it("sends one authenticated request to each own-data endpoint and returns API values", async () => {
    const stub = transport();
    const result = await readProgressFromApi({ base: BASE, token: "student-jwt", fetchImpl: stub.fetchImpl });

    assert.equal(result.state, PROGRESS_STATE.READY);
    assert.equal(result.model.studentId, STUDENT_ID);
    assert.equal(result.model.overallMastery, 72);
    assert.deepEqual(stub.calls.map((call) => new URL(call.url).pathname), [
      "/api/v1/students/me",
      "/api/v1/progress/me",
      "/api/v1/learning-path/me",
    ]);
    assert.ok(stub.calls.every((call) => call.options.headers.Authorization === "Bearer student-jwt"));
  });

  it("rejects malformed success envelopes instead of showing misleading progress", async () => {
    const stub = transport({ "/progress/me": { unexpected: true } });
    const result = await readProgressFromApi({ base: BASE, token: "token", fetchImpl: stub.fetchImpl });
    assert.deepEqual(result, { state: PROGRESS_STATE.ERROR, reason: "unavailable" });
  });

  it("rejects missing arrays, null records, and invalid scores in a successful reply", async () => {
    for (const data of [null, { student_id: STUDENT_ID }, {
      student_id: STUDENT_ID,
      overall_mastery: "95",
      diagnostic_score: null,
      growth: null,
      competencies: [],
      recent_activity: [],
    }]) {
      const stub = transport({ "/progress/me": { data } });
      const result = await readProgressFromApi({ base: BASE, token: "token", fetchImpl: stub.fetchImpl });
      assert.equal(result.state, PROGRESS_STATE.ERROR);
    }
  });

  it("returns an error after a required request network failure", async () => {
    const stub = transport({ "/progress/me": new TypeError("fetch failed") });
    const result = await readProgressFromApi({ base: BASE, token: "token", fetchImpl: stub.fetchImpl });
    assert.deepEqual(result, { state: PROGRESS_STATE.ERROR, reason: "unavailable" });
  });

  it("rejects progress associated with a different learner", async () => {
    const stub = transport({
      "/progress/me": { data: {
        student_id: "58000000-0000-4000-8000-000000000099",
        overall_mastery: null,
        diagnostic_score: null,
        growth: null,
        competencies: [],
        recent_activity: [],
      } },
    });
    const result = await readProgressFromApi({ base: BASE, token: "token", fetchImpl: stub.fetchImpl });
    assert.deepEqual(result, { state: PROGRESS_STATE.ERROR, reason: "association" });
  });

  it("degrades safely when only learning-path data is malformed", async () => {
    const stub = transport({ "/learning-path/me": { data: null } });
    const result = await readProgressFromApi({ base: BASE, token: "token", fetchImpl: stub.fetchImpl });
    assert.equal(result.state, PROGRESS_STATE.READY);
    assert.equal(result.pathUnavailable, true);
  });
});
