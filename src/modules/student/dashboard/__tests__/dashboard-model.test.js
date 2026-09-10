/**
 * Unit tests for the dashboard view model.
 *
 * The states below are the ones a real learner passes through, and each is
 * built from the shape the MathSmart API actually returns. What is being pinned
 * is which decided value the dashboard puts first, never a recalculation of it.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  STUDENT_ROUTE,
  buildDashboardModel,
} from "../utils/dashboard-model.js";

const MODULE_ID = "9ce8243b-37e0-4398-af75-ebae0be79010";

function learner(overrides = {}) {
  return {
    student_id: "bd3ce601-a2bc-48be-9625-6402536903c9",
    learner_id: "E2E-STUDENT-001",
    full_name: "Maria Santos",
    monitoring_status: "active",
    diagnostic_status: "completed",
    ...overrides,
  };
}

function progress(overrides = {}) {
  return {
    student_id: "bd3ce601-a2bc-48be-9625-6402536903c9",
    overall_mastery: 68,
    diagnostic_score: 50,
    growth: 18,
    modules_completed_count: 2,
    total_modules_count: 8,
    active_intervention_count: 0,
    monitoring_status: "active",
    recommended_next_action: {
      type: "module",
      resource_id: MODULE_ID,
      label: "Continue Fractions on a number line",
    },
    competencies: [],
    recent_activity: [],
    ...overrides,
  };
}

function pathItem(overrides = {}) {
  return {
    id: "dcee861e-0f8e-4a19-a7de-c1caca095027",
    priority: 1,
    reason: "Assessment score of 42% places this competency in the Needs Improvement band.",
    status: "available",
    competency: { id: "c5b8", code: "M6NS-Ia-1", name: "Fractions on a number line" },
    module: { id: MODULE_ID, title: "Fractions on a number line", estimated_minutes: 15 },
    ...overrides,
  };
}

describe("the dominant next action", () => {
  it("is the diagnostic while the diagnostic has not started", () => {
    const model = buildDashboardModel({
      learner: learner({ diagnostic_status: "not_started" }),
      progress: progress(),
      pathItems: [pathItem()],
    });

    assert.equal(model.nextAction.kind, "diagnostic");
    assert.equal(model.nextAction.title, "Take your diagnostic");
    assert.equal(model.nextAction.href, STUDENT_ROUTE.ASSESSMENTS);
  });

  it("is finishing the diagnostic while it is in progress", () => {
    const model = buildDashboardModel({
      learner: learner({ diagnostic_status: "in_progress" }),
      progress: progress(),
      pathItems: [pathItem()],
    });

    assert.equal(model.nextAction.kind, "diagnostic");
    assert.equal(model.nextAction.title, "Finish your diagnostic");
    assert.equal(model.nextAction.cta, "Finish the diagnostic");
  });

  it("is the module the API recommended once the diagnostic is complete", () => {
    const model = buildDashboardModel({
      learner: learner(),
      progress: progress(),
      pathItems: [pathItem()],
    });

    assert.equal(model.nextAction.kind, "module");
    assert.equal(model.nextAction.title, "Fractions on a number line");
    assert.equal(model.nextAction.cta, "Start this module");
    assert.equal(model.nextAction.href, STUDENT_ROUTE.MY_LEARNING);
    assert.equal(model.nextAction.meta.minutes, 15);
  });

  it("says continue when that module is already in progress", () => {
    const model = buildDashboardModel({
      learner: learner(),
      progress: progress(),
      pathItems: [pathItem({ status: "in_progress" })],
    });

    assert.equal(model.nextAction.cta, "Continue this module");
    assert.equal(model.nextAction.eyebrow, "Carry on");
    assert.equal(model.nextAction.meta.statusLabel, "In progress");
  });

  it("celebrates when the path exists but nothing is left to do", () => {
    const model = buildDashboardModel({
      learner: learner(),
      progress: progress({
        recommended_next_action: {
          type: "dashboard",
          resource_id: null,
          label: "Return to Dashboard",
        },
      }),
      pathItems: [pathItem({ status: "completed" })],
    });

    assert.equal(model.nextAction.kind, "all_done");
    assert.equal(model.nextAction.href, STUDENT_ROUTE.PROGRESS);
  });

  it("offers My Learning when no path has been built yet", () => {
    const model = buildDashboardModel({
      learner: learner(),
      progress: progress({
        recommended_next_action: {
          type: "dashboard",
          resource_id: null,
          label: "Return to Dashboard",
        },
      }),
      pathItems: [],
    });

    assert.equal(model.nextAction.kind, "no_path");
    assert.equal(model.nextAction.href, STUDENT_ROUTE.MY_LEARNING);
  });

  it("still sends the learner somewhere real when the path list is unavailable", () => {
    const model = buildDashboardModel({
      learner: learner(),
      progress: progress(),
      pathItems: [],
    });

    assert.equal(model.nextAction.kind, "module");
    assert.equal(model.nextAction.title, "Continue Fractions on a number line");
    assert.equal(model.nextAction.href, STUDENT_ROUTE.MY_LEARNING);
  });

  it("only ever points at a route that exists", () => {
    const routes = new Set(Object.values(STUDENT_ROUTE));
    const cases = [
      { diagnostic_status: "not_started", items: [] },
      { diagnostic_status: "in_progress", items: [] },
      { diagnostic_status: "completed", items: [pathItem()] },
      { diagnostic_status: "completed", items: [] },
      { diagnostic_status: null, items: [] },
    ];

    for (const { diagnostic_status, items } of cases) {
      const model = buildDashboardModel({
        learner: learner({ diagnostic_status }),
        progress: progress({
          recommended_next_action: { type: "dashboard", resource_id: null, label: "x" },
        }),
        pathItems: items,
      });

      assert.ok(routes.has(model.nextAction.href), `${model.nextAction.href} is not a route`);
    }
  });
});

describe("diagnostic status", () => {
  it("is written out for each value the API can return", () => {
    for (const [value, label] of [
      ["not_started", "Not started"],
      ["in_progress", "In progress"],
      ["completed", "Completed"],
    ]) {
      const model = buildDashboardModel({
        learner: learner({ diagnostic_status: value }),
        progress: progress(),
        pathItems: [],
      });

      assert.equal(model.diagnostic.label, label);
      assert.ok(model.diagnostic.summary.length > 0);
    }
  });

  it("degrades to a readable label when the API sends nothing", () => {
    const model = buildDashboardModel({
      learner: learner({ diagnostic_status: null }),
      progress: progress(),
      pathItems: [],
    });

    assert.equal(model.diagnostic.label, "Not available");
    assert.equal(model.diagnostic.isComplete, false);
  });
});

describe("learner support", () => {
  it("speaks calmly when a learner needs intervention", () => {
    const model = buildDashboardModel({
      learner: learner({ monitoring_status: "needs_intervention" }),
      progress: progress({ monitoring_status: "needs_intervention" }),
      pathItems: [],
    });

    assert.equal(model.support.tone, "support");
    assert.equal(model.support.heading, "Your teacher is setting up extra help");

    const body = model.support.body.toLowerCase();
    for (const word of ["fail", "behind", "problem", "weak", "poor"]) {
      assert.ok(!body.includes(word), `support wording should not say "${word}"`);
    }
  });

  it("also reacts to an open intervention the summary reports", () => {
    const model = buildDashboardModel({
      learner: learner(),
      progress: progress({ active_intervention_count: 1 }),
      pathItems: [],
    });

    assert.equal(model.support.tone, "support");
  });

  it("stays quiet for a learner who is simply working", () => {
    const model = buildDashboardModel({
      learner: learner(),
      progress: progress(),
      pathItems: [],
    });

    assert.equal(model.support, null);
  });
});

describe("progress figures", () => {
  it("passes the API's own numbers through untouched", () => {
    const model = buildDashboardModel({
      learner: learner(),
      progress: progress(),
      pathItems: [],
    });

    assert.equal(model.plot.diagnosticScore, 50);
    assert.equal(model.plot.currentScore, 68);
    assert.equal(model.plot.growthValue, 18);
    assert.equal(model.plot.growth.direction, "up");
    assert.deepEqual(
      { finished: model.modules.finished, total: model.modules.total },
      { finished: 2, total: 8 },
    );
    assert.equal(model.modules.percent, 25);
  });

  it("survives a learner with no evidence at all", () => {
    const model = buildDashboardModel({
      learner: learner({ diagnostic_status: "not_started" }),
      progress: progress({
        overall_mastery: null,
        diagnostic_score: null,
        growth: null,
        modules_completed_count: 0,
        total_modules_count: 0,
        competencies: [],
        recent_activity: [],
      }),
      pathItems: [],
    });

    assert.equal(model.plot.currentScore, null);
    assert.equal(model.plot.growth.direction, "unknown");
    assert.equal(model.modules.percent, null);
    assert.equal(model.competencies.isEmpty, true);
    assert.equal(model.activity.isEmpty, true);
    assert.equal(model.path.isEmpty, true);
  });

  it("survives an entirely absent progress payload", () => {
    const model = buildDashboardModel({ learner: null, progress: null, pathItems: null });

    assert.equal(model.nextAction.kind, "diagnostic");
    assert.equal(model.competencies.isEmpty, true);
    assert.equal(model.modules.total, 0);
    assert.equal(model.support, null);
  });
});

describe("competencies", () => {
  it("labels each mastery band and gives it a shape as well", () => {
    const model = buildDashboardModel({
      learner: learner(),
      progress: progress({
        competencies: [
          { competency_id: "a", competency_name: "A", mastery_band: "Mastered", current_score: 90, diagnostic_score: 60, growth: 30 },
          { competency_id: "b", competency_name: "B", mastery_band: "Developing", current_score: 70, diagnostic_score: 70, growth: 0 },
          { competency_id: "c", competency_name: "C", mastery_band: "Needs Improvement", current_score: 30, diagnostic_score: 40, growth: -10 },
          { competency_id: "d", competency_name: "D", mastery_band: null, current_score: null, diagnostic_score: null, growth: null },
        ],
      }),
      pathItems: [],
    });

    assert.deepEqual(
      model.competencies.items.map((row) => [row.band.label, row.band.fill]),
      [
        ["Mastered", 3],
        ["Developing", 2],
        ["Needs practice", 1],
        ["Not scored yet", 0],
      ],
    );
  });

  it("shows a preview and counts what it left out", () => {
    const rows = Array.from({ length: 9 }, (_, index) => ({
      competency_id: `c${index}`,
      competency_name: `Competency ${index}`,
      mastery_band: "Developing",
      current_score: 50,
      diagnostic_score: 40,
      growth: 10,
    }));

    const model = buildDashboardModel({
      learner: learner(),
      progress: progress({ competencies: rows }),
      pathItems: [],
    });

    assert.equal(model.competencies.preview.length, 5);
    assert.equal(model.competencies.remaining, 4);
  });
});

describe("the learning path", () => {
  it("keeps the API's order and writes each status out", () => {
    const model = buildDashboardModel({
      learner: learner(),
      progress: progress(),
      pathItems: [
        pathItem({ id: "1", priority: 1, status: "in_progress" }),
        pathItem({ id: "2", priority: 2, status: "available" }),
        pathItem({ id: "3", priority: 3, status: "locked" }),
        pathItem({ id: "4", priority: 4, status: "completed" }),
        pathItem({ id: "5", priority: 5, status: "available" }),
      ],
    });

    assert.deepEqual(
      model.path.items.map((item) => item.statusLabel),
      ["In progress", "Ready to start", "Opens later", "Finished", "Ready to start"],
    );
    assert.equal(model.path.preview.length, 4);
    assert.equal(model.path.remaining, 1);
    assert.equal(model.path.activeCount, 3);
  });
});

describe("recent activity", () => {
  it("keeps the API's order and gives every row a stable key", () => {
    const model = buildDashboardModel({
      learner: learner(),
      progress: progress({
        recent_activity: [
          { date: "2026-09-09T20:38:50Z", label: "Diagnostic", score: 42, resource_id: null, title: "Grade 6 diagnostic" },
          { date: "2026-09-08T20:38:50Z", label: "Activity Attempt 1", score: 80, resource_id: "act-1", title: "Number line drill" },
        ],
      }),
      pathItems: [],
    });

    assert.deepEqual(
      model.activity.items.map((row) => row.title),
      ["Grade 6 diagnostic", "Number line drill"],
    );
    assert.equal(new Set(model.activity.items.map((row) => row.id)).size, 2);
  });
});
