/**
 * Unit tests for the My Learning view model.
 *
 * The inputs mirror the shapes the MathSmart API actually returns — catalogue
 * items with `module_id`, path items with a nested `module` and `competency`,
 * and detail documents whose rules may arrive in camel-case or snake-case.
 * What is being pinned is which values the screen puts first, never a
 * recalculation of a result the backend already decided.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activityRoute,
  buildModuleReaderModel,
  buildMyLearningModel,
  moduleRoute,
  MY_LEARNING_ROUTE,
} from "../utils/my-learning-model.js";

const MODULE_A = "4a39d286-e93e-4e75-9644-b873fcac185c";
const MODULE_B = "9ce8243b-37e0-4398-af75-ebae0be79010";

function catalogueItem(overrides = {}) {
  return {
    module_id: MODULE_A,
    competency_id: "13ec5f06-746e-45fb-a58a-92f4ce42621c",
    competency_name: "Multiplication and Division of Integers",
    grade_id: "grade-6",
    title: "Integer Sign Rules",
    estimated_minutes: 15,
    status: "published",
    order_index: 2,
    path_status: null,
    completion_percentage: 0,
    is_complete: false,
    ...overrides,
  };
}

function pathItem(overrides = {}) {
  return {
    id: "821a14d6-c49a-4f42-bc04-96388ec76a31",
    priority: 1,
    reason: "Diagnostic score of 35% indicates a foundational sign-rule gap.",
    status: "in_progress",
    competency: { id: "c1", code: "MATH6-INT-02", name: "Integers" },
    module: { id: MODULE_A, title: "Integer Sign Rules", estimated_minutes: 15 },
    ...overrides,
  };
}

describe("Routes", () => {
  it("exposes the list route and module/activity deep links", () => {
    assert.equal(MY_LEARNING_ROUTE, "/student/my-learning");
    assert.equal(moduleRoute(MODULE_A), "/student/my-learning/4a39d286-e93e-4e75-9644-b873fcac185c");
    assert.equal(activityRoute("abc"), "/student/activities/abc");
  });
});

describe("buildMyLearningModel", () => {
  it("places path items first, in the order the backend gave them", () => {
    const model = buildMyLearningModel({
      modules: [catalogueItem()],
      pathItems: [pathItem()],
    });
    assert.equal(model.pathEmpty, false);
    assert.equal(model.path.length, 1);
    assert.equal(model.path[0].moduleId, MODULE_A);
    assert.equal(model.path[0].priority, 1);
    assert.equal(model.path[0].reason.includes("Diagnostic score"), true);
    assert.equal(model.path[0].pathStatus.label, "In progress");
    assert.equal(model.path[0].cta, "Continue this module");
  });

  it("overlays catalogue facts on the path item without losing the reason", () => {
    const model = buildMyLearningModel({
      modules: [catalogueItem({ competency_name: "Integer Operations", completion_percentage: 40, is_complete: false })],
      pathItems: [pathItem({ status: "in_progress" })],
    });
    assert.equal(model.path[0].competencyName, "Integer Operations");
    assert.equal(model.path[0].completionPercentage, 40);
    assert.equal(model.path[0].isComplete, false);
    assert.equal(model.path[0].reason !== null, true);
  });

  it("keeps catalogue facts for a module that is on the path as completed", () => {
    const model = buildMyLearningModel({
      modules: [catalogueItem({ path_status: "completed", completion_percentage: 100, is_complete: true })],
      pathItems: [pathItem({ status: "completed" })],
    });
    assert.equal(model.path[0].isComplete, true);
    assert.equal(model.path[0].pathStatus.label, "Finished");
    assert.equal(model.path[0].cta, "Review this module");
  });

  it("falls back to the path item's own facts when the catalogue is silent", () => {
    const model = buildMyLearningModel({
      modules: [],
      pathItems: [
        pathItem({ module: { id: MODULE_A, title: "Sign Rules", estimated_minutes: 20 } }),
      ],
    });
    assert.equal(model.path[0].title, "Sign Rules");
    assert.equal(model.path[0].minutes, 20);
    assert.equal(model.path[0].completionPercentage, 0);
    assert.equal(model.path[0].isComplete, false);
  });

  it("drops a path item that has no module to open", () => {
    const model = buildMyLearningModel({
      modules: [],
      pathItems: [pathItem({ module: null })],
    });
    assert.equal(model.path.length, 0);
    assert.equal(model.pathEmpty, true);
  });

  it("sends the remaining published modules to the browse shelf, in curriculum order", () => {
    const model = buildMyLearningModel({
      modules: [
        catalogueItem({ module_id: MODULE_A, order_index: 2 }),
        catalogueItem({ module_id: MODULE_B, title: "Fraction Addition", order_index: 1 }),
      ],
      pathItems: [pathItem()],
    });
    assert.deepEqual(
      model.browse.map((row) => row.moduleId),
      [MODULE_B],
    );
    assert.equal(model.browse[0].statusValue, null);
    assert.equal(model.browse[0].pathStatus.label, "Ready to start");
    assert.equal(model.browse[0].cta, "Open this module");
  });

  it("reads a finished browse module as reviewable", () => {
    const model = buildMyLearningModel({
      modules: [catalogueItem({ module_id: MODULE_B, is_complete: true })],
      pathItems: [],
    });
    assert.equal(model.browse[0].statusValue, "completed");
    assert.equal(model.browse[0].pathStatus.label, "Finished");
    assert.equal(model.browse[0].cta, "Review this module");
  });

  it("reports an empty catalogue before anything else", () => {
    const model = buildMyLearningModel({ modules: [], pathItems: [] });
    assert.equal(model.catalogueEmpty, true);
    assert.equal(model.path.length, 0);
    assert.equal(model.browse.length, 0);
  });
});

describe("buildModuleReaderModel", () => {
  function detail(overrides = {}) {
    return {
      id: MODULE_A,
      competency_name: "Multiplication and Division of Integers",
      title: "Integer Sign Rules",
      estimated_minutes: 15,
      path_status: "in_progress",
      learning_objective: "Apply sign rules to integer multiplication and division.",
      short_explanation: "Equal signs give a positive result; different signs give negative.",
      rules: [
        { title: "Same signs", ruleFormula: "(-a) × (-b) = +(ab)", explanation: "Two equal signs produce a positive product.", visualExample: "Two reversals on the number line" },
      ],
      worked_examples: [
        { problem: "(-6) × (-4)", steps: ["Identify two negative signs.", "Apply the same-sign rule."], solution: "24", tip: "Check the sign first." },
      ],
      associated_activities: [{ id: "fd80", title: "Integer Sign Practice", status: "published" }],
      section_ids: ["objective", "concept", "rule_1", "example_1"],
      progress: { completion_percentage: 50, is_complete: false, completed_section_ids: ["objective", "concept"], last_section_id: "concept" },
      ...overrides,
    };
  }

  it("normalises the reader with the backend's own numbers", () => {
    const model = buildModuleReaderModel(detail());
    assert.equal(model.id, MODULE_A);
    assert.equal(model.title, "Integer Sign Rules");
    assert.equal(model.pathStatus, "in_progress");
    assert.equal(model.ruleCount, 1);
    assert.equal(model.exampleCount, 1);
    assert.equal(model.rules[0].formula, "(-a) × (-b) = +(ab)");
    assert.equal(model.rules[0].visual, "Two reversals on the number line");
    assert.deepEqual(model.workedExamples[0].steps, ["Identify two negative signs.", "Apply the same-sign rule."]);
    assert.equal(model.progress.percent, 50);
    assert.equal(model.progress.isComplete, false);
    assert.deepEqual(model.activities, [{ id: "fd80", title: "Integer Sign Practice", status: "published" }]);
  });

  it("accepts snake-case rules as the documented contract writes them", () => {
    const model = buildModuleReaderModel(
      detail({
        rules: [{ title: "Same signs", rule_formula: "(-a) × (-b) = +(ab)", explanation: "Two equal signs produce a positive product.", visual_example: "A reversal" }],
      }),
    );
    assert.equal(model.rules[0].formula, "(-a) × (-b) = +(ab)");
    assert.equal(model.rules[0].visual, "A reversal");
    assert.equal(model.rules[0].highlight, null);
  });

  it("names the four kinds of sections from their ids", () => {
    const model = buildModuleReaderModel(detail());
    assert.deepEqual(
      model.sections.map((section) => [section.id, section.label, section.done]),
      [
        ["objective", "The learning goal", true],
        ["concept", "The big idea", true],
        ["rule_1", "Rule 1", false],
        ["example_1", "Worked example 1", false],
      ],
    );
  });

  it("treats a missing progress row as not started, not as zero", () => {
    const model = buildModuleReaderModel(detail({ progress: null, path_status: null }));
    assert.equal(model.progress.percent, 0);
    assert.equal(model.progress.isComplete, false);
    assert.deepEqual(model.progress.completedSectionIds, []);
    assert.equal(model.allSectionsFinished, false);
    assert.equal(model.pathStatus, null);
  });

  it("flags a lesson whose sections are all finished as complete", () => {
    const model = buildModuleReaderModel(
      detail({
        progress: {
          completion_percentage: 50,
          is_complete: false,
          completed_section_ids: ["objective", "concept", "rule_1", "example_1"],
          last_section_id: "example_1",
        },
      }),
    );
    assert.equal(model.allSectionsFinished, true);
  });

  it("survives malformed content without guessing", () => {
    const model = buildModuleReaderModel(
      detail({ rules: "not-a-list", worked_examples: null, section_ids: null, progress: null }),
    );
    assert.equal(model.ruleCount, 0);
    assert.equal(model.exampleCount, 0);
    assert.equal(model.sections.length, 0);
    assert.equal(model.progress.percent, 0);
  });
});