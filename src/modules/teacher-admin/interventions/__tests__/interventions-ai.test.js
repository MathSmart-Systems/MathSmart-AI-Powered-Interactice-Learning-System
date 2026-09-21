import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClassPatternAnalysisPayload,
  formatGeneratedAt,
  provenanceLabel,
  readAdvisory,
  storedPlan,
  strategyNote,
  suggestionNoteDraft,
  suggestionFailure,
} from "../utils/intervention-helpers.js";

const FORBIDDEN_FRAGMENTS = ["name", "email", "phone", "avatar", "address", "token", "secret"];
const VALID_RESULT = {
  ok: true,
  status: 200,
  data: {
    insight_summary: "  The learner would benefit from revisiting sign rules.  ",
    provider: "groq",
    model: "llama-3",
    generated_at: "2026-09-19T07:30:00Z",
    confidence_score: null,
  },
  error: null,
  code: null,
};

function collectKeys(value, keys = []) {
  if (Array.isArray(value) || typeof value !== "object" || value === null) return keys;
  for (const key of Object.keys(value)) {
    keys.push(key.toLowerCase());
    collectKeys(value[key], keys);
  }
  return keys;
}

function assertNoForbiddenKeys(payload) {
  const keys = collectKeys(payload);
  for (const key of keys) {
    for (const fragment of FORBIDDEN_FRAGMENTS) {
      assert.ok(
        !key.includes(fragment),
        `payload key "${key}" must not reach the adapter redaction filter`
      );
    }
  }
}

const PLAN_CASE = {
  id: "c-1",
  educator_notes: "The teacher wrote this.",
  evidence: { current_score: 40 },
  ai_insight: "  Ana drops the decimal point when she divides.  ",
  ai_plan: {
    gap: "Ana drops the decimal point when she divides.",
    strategies: [
      "Work three problems on a number line first.",
      "Ask her to estimate before she writes anything.",
      "Compare two answers and say which is sensible.",
      "A fourth the backend should never have sent.",
    ],
    scaffold: "A place-value chart with the point drawn in red.",
    next_check: "Two similar problems on Friday.",
  },
  ai_provider: "groq",
  ai_generated_at: "2026-09-19T07:30:00Z",
};

test("storedPlan reads the plan as the structure the panel renders", () => {
  const plan = storedPlan(PLAN_CASE);

  assert.equal(plan.gap, "Ana drops the decimal point when she divides.");
  assert.equal(plan.scaffold, "A place-value chart with the point drawn in red.");
  assert.equal(plan.nextCheck, "Two similar problems on Friday.");
  assert.equal(plan.provider, "groq");
});

test("storedPlan never shows more than three strategies", () => {
  // The backend caps this too. A panel that trusted the payload would grow a
  // fourth row the moment a model ignored the instruction.
  assert.equal(storedPlan(PLAN_CASE).strategies.length, 3);
});

test("storedPlan returns null for a case nobody has asked about", () => {
  assert.equal(storedPlan({ id: "c-1", educator_notes: "Teacher note." }), null);
  assert.equal(storedPlan({ ai_insight: "   ", ai_plan: null }), null);
  assert.equal(storedPlan(null), null);
});

test("storedPlan falls back to the plain text a case stored before plans existed", () => {
  const plan = storedPlan({
    ai_insight: "She loses the place value.",
    ai_provider: "groq",
  });

  assert.equal(plan.gap, "She loses the place value.");
  assert.deepEqual(plan.strategies, []);
  assert.equal(plan.scaffold, null);
});

test("storedPlan never reads a teacher's own notes as advisory text", () => {
  const plan = storedPlan({
    educator_notes: "Scheduled a number-line session.",
    ai_plan: { gap: "Revisit place value.", strategies: [] },
  });

  assert.equal(plan.gap, "Revisit place value.");
  assert.deepEqual(plan.strategies, []);
});

test("strategyNote hands over the line and nothing else", () => {
  const note = strategyNote("  Work three problems on a number line first.  ");

  // No preamble. A draft somebody has to delete before they can write is not
  // a draft; the plan and the audit trail already record where it came from.
  assert.equal(note, "Work three problems on a number line first.");
  assert.equal(strategyNote("   "), "");
  assert.equal(strategyNote(null), "");
});

test("suggestionNoteDraft offers the whole plan as one editable note", () => {
  const draft = suggestionNoteDraft(PLAN_CASE);

  // The suggestion itself, with nothing added in front of it.
  assert.ok(draft.startsWith("Ana drops the decimal point"));
  assert.ok(!draft.includes("Reviewed an AI suggestion"));
  assert.ok(draft.includes("number line"));
  assert.ok(draft.includes("place-value chart"));
  assert.ok(draft.includes("Friday"));
});

test("suggestionNoteDraft stays inside the notes limit the API enforces", () => {
  const draft = suggestionNoteDraft({ ai_insight: "x".repeat(5000) });
  assert.ok(draft.length <= 4000);
});

test("suggestionNoteDraft is empty when there is no suggestion to take up", () => {
  assert.equal(suggestionNoteDraft({ educator_notes: "Teacher note." }), "");
  assert.equal(suggestionNoteDraft(null), "");
});

test("no stored plan text carries Markdown into the interface", () => {
  // The backend strips markup before storing, and this is the assertion that
  // notices if that ever stops being true.
  const plan = storedPlan(PLAN_CASE);
  const rendered = [plan.gap, ...plan.strategies, plan.scaffold, plan.nextCheck]
    .filter(Boolean)
    .join(" ");

  for (const marker of ["**", "###", "`", "|"]) {
    assert.ok(!rendered.includes(marker), `rendered plan must not contain ${marker}`);
  }
});

test("a failure says what is still true, not what to go and fix", () => {
  const outage = suggestionFailure({
    ok: false,
    status: 503,
    code: "groq_assistance_unavailable",
  });

  // No server to restart, no configuration named. A teacher needs to know
  // whether to carry on without the advice; the rest is in the API's logs.
  assert.match(outage, /could not be produced just now/);
  assert.match(outage, /notes and the evidence are unchanged/);
  assert.ok(!outage.includes("Restart"));
  assert.ok(!outage.includes("deployment"));
});

test("an unrecognised failure still answers the teacher", () => {
  assert.match(
    suggestionFailure({ ok: false, status: 500, code: "server_error" }),
    /could not be produced just now/,
  );
  assert.match(suggestionFailure({ code: "unreachable" }), /could not be produced just now/);
  assert.match(suggestionFailure(null), /could not be produced just now/);
});

test("a session or a permission problem is named as itself", () => {
  assert.match(suggestionFailure({ ok: false, status: 401 }), /session has ended/);
  assert.match(suggestionFailure({ ok: false, code: "no_session" }), /session has ended/);
  assert.match(suggestionFailure({ ok: false, status: 403 }), /cannot ask for suggestions/);
});

test("a 404 reads as a closed case or as an absent feature, never as both", () => {
  const closed = suggestionFailure({ ok: false, status: 404 }, { caseClosed: true });
  const missing = suggestionFailure({ ok: false, status: 404 }, { caseClosed: false });

  assert.match(closed, /case is closed/);
  assert.match(missing, /not available here yet/);
  assert.ok(!missing.includes("closed"));
  // Neither tells the teacher to go and restart anything.
  for (const message of [closed, missing]) {
    assert.ok(!message.includes("Restart"));
  }
});

test("buildClassPatternAnalysisPayload returns null without cases or scope", () => {
  assert.equal(buildClassPatternAnalysisPayload([], { sectionId: "s1" }), null);
  assert.equal(
    buildClassPatternAnalysisPayload([{ severity: "HIGH", status: "Needs Intervention" }], {}),
    null
  );
});

test("buildClassPatternAnalysisPayload returns null when no scope resolves", () => {
  const cases = [{ severity: "HIGH", status: "Needs Intervention" }];

  // A stale section filter that the directory no longer contains leaves the
  // payload with neither a class nor a competency, so no request is built.
  assert.equal(
    buildClassPatternAnalysisPayload(cases, { sectionId: "missing-section", sections: [] }),
    null
  );
  assert.equal(
    buildClassPatternAnalysisPayload(cases, {
      sectionId: "missing-section",
      sections: [{ section_id: "section-1", name: "Rizal" }],
    }),
    null
  );
});

test("buildClassPatternAnalysisPayload aggregates severity and status without names", () => {
  const cases = [
    { severity: "HIGH", status: "Needs Intervention" },
    { severity: "MEDIUM", status: "Needs Intervention" },
    { severity: "LOW", status: "Resolved" },
  ];

  const payload = buildClassPatternAnalysisPayload(cases, {
    sectionId: "section-1",
    competencyId: "comp-1",
    sections: [{ section_id: "section-1", name: "Rizal" }],
  });

  // The advisory contract's class field carries the section, because a grade
  // describes every case in a Grade 6 product and says nothing.
  assert.equal(payload.grade, "Rizal");
  assert.equal(payload.competencyId, "comp-1");
  assert.match(payload.displayContext, /3 intervention cases/);
  assert.match(payload.displayContext, /1 HIGH, 1 MEDIUM, 1 LOW/);
  assert.match(payload.displayContext, /2 Needs Intervention, 1 Resolved/);
  assert.match(payload.displayContext, /No individually identifying/);
  assert.deepEqual(payload.incorrectAttempts, []);
  assert.ok(payload.displayContext.length <= 2000);
  assertNoForbiddenKeys(payload);
});

test("buildClassPatternAnalysisPayload accepts a competency scope on its own", () => {
  const payload = buildClassPatternAnalysisPayload(
    [{ severity: "HIGH", status: "In Progress" }],
    { competencyId: "comp-1" },
  );

  assert.equal(payload.grade, null);
  assert.equal(payload.competencyId, "comp-1");
});
