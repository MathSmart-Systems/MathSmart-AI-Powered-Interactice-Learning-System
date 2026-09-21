import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { readInsight, writeInsight } from "../utils/insight-cache.js";

/** A stand-in for the browser's own storage. */
function fakeStorage({ failOnWrite = false, failOnRead = false } = {}) {
  const entries = new Map();
  return {
    entries,
    getItem(key) {
      if (failOnRead) throw new Error("blocked");
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      if (failOnWrite) throw new Error("quota");
      entries.set(key, value);
    },
  };
}

function withWindow(storage) {
  globalThis.window = { localStorage: storage };
}

afterEach(() => {
  delete globalThis.window;
});

const ATTEMPT = "11111111-1111-4111-8111-111111111111";
const FEEDBACK = {
  feedback_text: "You are close on fractions.",
  provider: "groq",
  model: "a-model",
  generated_at: "2026-09-21T00:00:00Z",
};

describe("insight cache", () => {
  it("gives back the summary it was asked to keep", () => {
    withWindow(fakeStorage());

    writeInsight(ATTEMPT, FEEDBACK);

    assert.equal(readInsight(ATTEMPT).feedback_text, "You are close on fractions.");
  });

  it("keeps each attempt's summary apart", () => {
    withWindow(fakeStorage());
    const other = "22222222-2222-4222-8222-222222222222";

    writeInsight(ATTEMPT, FEEDBACK);
    writeInsight(other, { ...FEEDBACK, feedback_text: "A different paper." });

    assert.equal(readInsight(ATTEMPT).feedback_text, "You are close on fractions.");
    assert.equal(readInsight(other).feedback_text, "A different paper.");
  });

  it("has nothing for an attempt it was never given", () => {
    withWindow(fakeStorage());

    assert.equal(readInsight(ATTEMPT), null);
  });

  it("refuses to key anything on a missing attempt", () => {
    const storage = fakeStorage();
    withWindow(storage);

    writeInsight(null, FEEDBACK);
    writeInsight(undefined, FEEDBACK);

    assert.equal(storage.entries.size, 0);
    assert.equal(readInsight(null), null);
  });

  it("does not keep an answer that has no text", () => {
    // There is nothing to show, and storing it would suppress the next ask.
    const storage = fakeStorage();
    withWindow(storage);

    writeInsight(ATTEMPT, { provider: "groq" });
    writeInsight(ATTEMPT, null);

    assert.equal(storage.entries.size, 0);
  });

  it("ignores a stored entry that lost its text", () => {
    const storage = fakeStorage();
    withWindow(storage);
    storage.entries.set(
      "mathsmart:assessment-insight:v1:" + ATTEMPT,
      JSON.stringify({ provider: "groq" }),
    );

    assert.equal(readInsight(ATTEMPT), null);
  });

  it("ignores an entry that is not readable as JSON", () => {
    const storage = fakeStorage();
    withWindow(storage);
    storage.entries.set("mathsmart:assessment-insight:v1:" + ATTEMPT, "{not json");

    assert.equal(readInsight(ATTEMPT), null);
  });

  it("survives a browser that refuses to store anything", () => {
    // Private windows and blocked site data throw rather than return null.
    // Losing the convenience is fine; losing the report is not.
    withWindow(fakeStorage({ failOnWrite: true }));

    assert.doesNotThrow(() => writeInsight(ATTEMPT, FEEDBACK));
  });

  it("survives a browser that refuses to be read", () => {
    withWindow(fakeStorage({ failOnRead: true }));

    assert.equal(readInsight(ATTEMPT), null);
  });

  it("asks for nothing on the server, where there is no storage", () => {
    assert.equal(readInsight(ATTEMPT), null);
    assert.doesNotThrow(() => writeInsight(ATTEMPT, FEEDBACK));
  });
});
