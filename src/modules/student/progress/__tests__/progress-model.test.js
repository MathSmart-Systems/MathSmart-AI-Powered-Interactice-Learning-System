/**
 * Unit tests for the Student Progress view model.
 *
 * Verifies that all metrics, formatting, status bands, and history
 * transformations function deterministically and handle edge cases safely.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildProgressModel,
  formatDate,
  formatGrowth,
  formatScore,
  masteryStatus,
  toNumber,
} from "../utils/progress-model.js";
import { STUDENT_ROUTE } from "../utils/constants.js";

const COMPETENCY_ID_1 = "13ec5f06-746e-45fb-a58a-92f4ce42621c";
const COMPETENCY_ID_2 = "4a39d286-e93e-4e75-9644-b873fcac185c";

function mockLearner(overrides = {}) {
  return {
    student_id: "58000000-0000-4000-8000-000000000001",
    learner_id: "STU-2026-001",
    full_name: "Juan Dela Cruz",
    diagnostic_status: "completed",
    ...overrides,
  };
}

function mockProgress(overrides = {}) {
  return {
    student_id: "58000000-0000-4000-8000-000000000001",
    overall_mastery: 75.4,
    diagnostic_score: 55.0,
    growth: 20.4,
    modules_completed_count: 3,
    total_modules_count: 6,
    active_intervention_count: 1,
    monitoring_status: "active",
    recommended_next_action: {
      type: "module",
      resource_id: "mod-101",
      label: "Continue Multiplication of Integers",
    },
    competencies: [
      {
        competency_id: COMPETENCY_ID_1,
        competency_code: "MATH6-INT-01",
        competency_name: "Integer Addition & Subtraction",
        diagnostic_score: 90,
        current_score: 95,
        growth: 5,
        mastery_band: "Mastered",
        attempt_count: 3,
        unsuccessful_attempts: 0,
        trajectory: [
          { date: "2026-08-10T08:00:00Z", score: 90, label: "Diagnostic Baseline" },
          { date: "2026-08-20T09:00:00Z", score: 95, label: "Practice Activity 1" },
        ],
      },
      {
        competency_id: COMPETENCY_ID_2,
        competency_code: "MATH6-INT-02",
        competency_name: "Multiplication and Division of Integers",
        diagnostic_score: 40,
        current_score: 55,
        growth: 15,
        mastery_band: "Needs Improvement",
        attempt_count: 4,
        unsuccessful_attempts: 2,
        trajectory: [],
      },
    ],
    recent_activity: [
      {
        date: "2026-09-01T10:00:00Z",
        label: "Diagnostic Baseline",
        score: 55,
        title: "Grade 6 Diagnostic Baseline",
      },
      {
        date: "2026-09-05T14:00:00Z",
        label: "Interactive Practice",
        score: 85,
        title: "Integer Multiplication Drills",
      },
    ],
    ...overrides,
  };
}

describe("Progress Model Formatting Helpers", () => {
  it("toNumber safely extracts finite numbers", () => {
    assert.equal(toNumber(42), 42);
    assert.equal(toNumber(0), 0);
    assert.equal(toNumber(-15.5), -15.5);
    assert.equal(toNumber("42"), null);
    assert.equal(toNumber(null), null);
    assert.equal(toNumber(undefined), null);
    assert.equal(toNumber(NaN), null);
    assert.equal(toNumber(Infinity), null);
  });

  it("formatScore rounds and formats whole percentages", () => {
    assert.equal(formatScore(75.6), "76%");
    assert.equal(formatScore(0), "0%");
    assert.equal(formatScore(null), "—");
    assert.equal(formatScore(undefined, "Not taken"), "Not taken");
  });

  it("formatGrowth prints signed deltas or flat zero", () => {
    assert.equal(formatGrowth(18.2), "+18%");
    assert.equal(formatGrowth(-7.4), "-7%");
    assert.equal(formatGrowth(0), "0%");
    assert.equal(formatGrowth(null), "—");
  });

  it("formatDate produces Philippine locale date string", () => {
    const formatted = formatDate("2026-08-10T00:00:00Z");
    assert.match(formatted, /10.*Aug.*2026/);
    assert.equal(formatDate(null), "Recently");
    assert.equal(formatDate("invalid-date"), "Recently");
  });

  it("masteryStatus resolves correct labels and variant badges", () => {
    const mastered = masteryStatus("Mastered", 90);
    assert.equal(mastered.label, "Mastered");
    assert.equal(mastered.variant, "mastered");

    const developing = masteryStatus("Developing", 70);
    assert.equal(developing.label, "Developing");
    assert.equal(developing.variant, "developing");

    const needsSupport = masteryStatus("Needs Improvement", 45);
    assert.equal(needsSupport.label, "Needs Support");
    assert.equal(needsSupport.variant, "needs_support");

    const unscored = masteryStatus(null, null);
    assert.equal(unscored.label, "Not Scored");
    assert.equal(unscored.variant, "unscored");
  });
});

describe("buildProgressModel Transformation", () => {
  it("transforms a complete progress payload into presentation model", () => {
    const model = buildProgressModel({
      progress: mockProgress(),
      learner: mockLearner(),
      pathItems: [],
    });

    assert.equal(model.learnerName, "Juan Dela Cruz");
    assert.equal(model.overallMasteryFormatted, "75%");
    assert.equal(model.diagnosticScoreFormatted, "55%");
    assert.equal(model.growthFormatted, "+20%");
    assert.equal(model.modulesCompleted, 3);
    assert.equal(model.totalModules, 6);
    assert.equal(model.moduleCompletionPercent, 50);

    assert.equal(model.competencies.length, 2);
    assert.equal(model.masteredCount, 1);
    assert.equal(model.totalCompetencies, 2);
    assert.equal(model.masteryPercent, 50);

    const comp1 = model.competencies[0];
    assert.equal(comp1.code, "MATH6-INT-01");
    assert.equal(comp1.diagnosticFormatted, "90%");
    assert.equal(comp1.currentFormatted, "95%");
    assert.equal(comp1.growthFormatted, "+5%");
    assert.equal(comp1.status.label, "Mastered");
    assert.equal(comp1.trajectory.length, 2);

    assert.ok(model.recommendedAction);
    assert.equal(model.recommendedAction.title, "Continue Multiplication of Integers");
    assert.equal(model.recommendedAction.cta, "Continue Multiplication of Integers");
    assert.equal(model.recommendedAction.href, STUDENT_ROUTE.MY_LEARNING);

    assert.ok(model.history.assessments.length >= 1);
    assert.ok(model.history.activities.length >= 1);
    assert.equal(model.hasData, true);
  });

  it("handles a learner who has not taken diagnostic yet", () => {
    const model = buildProgressModel({
      progress: mockProgress({
        overall_mastery: null,
        diagnostic_score: null,
        growth: null,
        competencies: [],
        recent_activity: [],
        recommended_next_action: null,
      }),
      learner: mockLearner({ diagnostic_status: "not_started" }),
      pathItems: [],
    });

    assert.equal(model.overallMasteryFormatted, "0%");
    assert.equal(model.diagnosticScoreFormatted, "—");
    assert.equal(model.growthFormatted, "—");
    assert.equal(model.hasData, false);
    assert.equal(model.recommendedAction.type, "diagnostic");
    assert.equal(model.recommendedAction.href, STUDENT_ROUTE.DIAGNOSTIC);
  });

  it("handles completely empty inputs without throwing", () => {
    const model = buildProgressModel();

    assert.equal(model.learnerName, "Learner");
    assert.equal(model.overallMasteryFormatted, "0%");
    assert.equal(model.diagnosticScoreFormatted, "—");
    assert.equal(model.growthFormatted, "—");
    assert.equal(model.modulesCompleted, 0);
    assert.equal(model.totalModules, 0);
    assert.equal(model.moduleCompletionPercent, 0);
    assert.equal(model.competencies.length, 0);
    assert.equal(model.masteredCount, 0);
    assert.equal(model.history.assessments.length, 0);
    assert.equal(model.history.modules.length, 0);
    assert.equal(model.history.activities.length, 0);
  });
});
