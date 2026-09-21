/**
 * Unit tests for the Student Progress view model.
 *
 * Verifies that all metrics, formatting, status bands, and history
 * transformations function deterministically and handle edge cases safely.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attemptSummary,
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
    const mastered = masteryStatus("Mastered");
    assert.equal(mastered.label, "Mastered");
    assert.equal(mastered.variant, "mastered");

    const developing = masteryStatus("Developing");
    assert.equal(developing.label, "Developing");
    assert.equal(developing.variant, "developing");

    const needsSupport = masteryStatus("Needs Improvement");
    assert.equal(needsSupport.label, "Needs Support");
    assert.equal(needsSupport.variant, "needs_support");

    const unscored = masteryStatus(null);
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

  it("preserves backend mastery bands and growth even when scores imply another result", () => {
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({
        growth: -7,
        overall_mastery: 95,
        diagnostic_score: 10,
        competencies: [{
          competency_id: COMPETENCY_ID_1,
          current_score: 99,
          diagnostic_score: 20,
          growth: 4,
          mastery_band: "Needs Improvement",
        }],
      }),
    });

    assert.equal(model.growth, -7);
    assert.equal(model.competencies[0].growth, 4);
    assert.equal(model.competencies[0].status.variant, "needs_support");
  });

  it("ignores malformed nested rows without throwing or inventing mastery", () => {
    const model = buildProgressModel({
      learner: mockLearner({ full_name: { unexpected: true } }),
      progress: mockProgress({
        competencies: [null, "bad", { current_score: 99, trajectory: [null, { label: 7 }] }],
        recent_activity: [null, "bad", { label: { unexpected: true } }],
      }),
      pathItems: [null, "bad"],
    });

    assert.equal(model.learnerName, "Learner");
    assert.equal(model.competencies.length, 1);
    assert.equal(model.competencies[0].status.variant, "unscored");
    assert.equal(model.competencies[0].trajectory[0].label, "Attempt");
    assert.equal(model.history.activities[0].title, "Interactive Activity");
  });
});

describe("Attempt evidence behind a mastery band", () => {
  it("counts the attempts behind a band without restating the band", () => {
    assert.equal(attemptSummary(0, 0), "No attempts recorded yet");
    assert.equal(attemptSummary(1, 0), "Based on 1 attempt");
    assert.equal(attemptSummary(6, 0), "Based on 6 attempts");
    assert.equal(attemptSummary(4, 2), "Based on 4 attempts, 2 not yet passing");
  });

  it("never reports more unsuccessful attempts than attempts, or a negative count", () => {
    assert.equal(attemptSummary(2, 9), "Based on 2 attempts, 2 not yet passing");
    assert.equal(attemptSummary(-3, -1), "No attempts recorded yet");
    assert.equal(attemptSummary(null, null), "No attempts recorded yet");
  });

  it("carries the summary onto every competency row", () => {
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress(),
    });

    assert.equal(model.competencies[0].attemptSummary, "Based on 3 attempts");
    assert.equal(
      model.competencies[1].attemptSummary,
      "Based on 4 attempts, 2 not yet passing",
    );
  });
});

describe("Recommended next action routing", () => {
  it("routes a dashboard action to the dashboard and prints its label verbatim", () => {
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({
        recommended_next_action: {
          type: "dashboard",
          resource_id: null,
          label: "Return to Dashboard",
        },
      }),
    });

    assert.equal(model.recommendedAction.type, "dashboard");
    assert.equal(model.recommendedAction.href, STUDENT_ROUTE.DASHBOARD);
    assert.equal(model.recommendedAction.cta, "Return to Dashboard");
    assert.equal(model.recommendedAction.title, "Return to Dashboard");
  });

  it("keeps a module action on the learning path and does not re-prefix its label", () => {
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({
        recommended_next_action: {
          type: "module",
          resource_id: "mod-7",
          label: "Continue Dividing Fractions",
        },
      }),
    });

    assert.equal(model.recommendedAction.href, STUDENT_ROUTE.MY_LEARNING);
    assert.equal(model.recommendedAction.cta, "Continue Dividing Fractions");
  });

  it("sends a finished path to My Learning rather than repeating 'Continue'", () => {
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({
        recommended_next_action: {
          type: "path_complete",
          resource_id: null,
          label: "You have finished every module in your learning path",
        },
      }),
    });

    assert.equal(model.recommendedAction.href, STUDENT_ROUTE.MY_LEARNING);
    assert.equal(
      model.recommendedAction.cta,
      "You have finished every module in your learning path",
    );
  });

  it("sends a learner with no path to the diagnostic that builds one", () => {
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({
        recommended_next_action: {
          type: "diagnostic",
          resource_id: null,
          label: "Take your diagnostic assessment to build your learning path",
        },
      }),
    });

    assert.equal(model.recommendedAction.href, STUDENT_ROUTE.DIAGNOSTIC);
  });

  it("sends an action type it does not recognise to the dashboard, not to activities", () => {
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({
        recommended_next_action: { type: "intervention", label: "Meet your teacher" },
      }),
    });

    assert.equal(model.recommendedAction.href, STUDENT_ROUTE.DASHBOARD);
    assert.equal(model.recommendedAction.cta, "Meet your teacher");
  });
});

describe("All-mastered claim and its denominator", () => {
  function masteredTwice(overrides = {}) {
    return buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({
        competencies: [
          { competency_id: COMPETENCY_ID_1, current_score: 88, mastery_band: "Mastered" },
          { competency_id: COMPETENCY_ID_2, current_score: 91, mastery_band: "Mastered" },
        ],
        ...overrides,
      }),
    });
  }

  it("withholds the claim when no published Grade 6 total is supplied", () => {
    const model = masteredTwice();

    assert.equal(model.masteredCount, 2);
    assert.equal(model.publishedCompetencyTotal, null);
    assert.equal(model.hasPublishedCompetencyTotal, false);
    assert.equal(model.masteryDenominator, 2);
    assert.equal(model.masteryDenominatorSource, "attempted");
    assert.equal(model.allCompetenciesMastered, false);
  });

  it("withholds the claim when the published total is smaller than what was attempted", () => {
    const model = masteredTwice({ total_competencies_count: 1 });

    assert.equal(model.hasPublishedCompetencyTotal, false);
    assert.equal(model.masteryDenominator, 2);
    assert.equal(model.masteryDenominatorSource, "attempted");
    assert.equal(model.allCompetenciesMastered, false);
  });

  it("withholds the claim when the published total is zero", () => {
    const model = masteredTwice({ total_competencies_count: 0 });

    assert.equal(model.hasPublishedCompetencyTotal, false);
    assert.equal(model.allCompetenciesMastered, false);
  });

  it("measures mastery against the published total when one is supplied", () => {
    const model = masteredTwice({ total_competencies_count: 25 });

    assert.equal(model.publishedCompetencyTotal, 25);
    assert.equal(model.hasPublishedCompetencyTotal, true);
    assert.equal(model.masteryDenominator, 25);
    assert.equal(model.masteryDenominatorSource, "published");
    assert.equal(model.masteryPercent, 8);
    assert.equal(model.allCompetenciesMastered, false);
    assert.equal(model.attemptedCompetencies, 2);
  });

  it("allows the claim only when every published competency is mastered", () => {
    const model = masteredTwice({ total_competencies_count: 2 });

    assert.equal(model.allCompetenciesMastered, true);
    assert.equal(model.masteryPercent, 100);
  });

  it("rejects a published total that is not a whole count", () => {
    const model = masteredTwice({ total_competencies_count: 12.5 });

    assert.equal(model.publishedCompetencyTotal, null);
    assert.equal(model.allCompetenciesMastered, false);
  });

  it("counts mastery with the API's own figure, not the rows the drill-down returned", () => {
    const model = masteredTwice({
      competencies_mastered_count: 7,
      total_competencies_count: 25,
    });

    // Only two competency rows came back, but seven are mastered across the
    // published set, and both halves of the fraction count that same set.
    assert.equal(model.masteredCount, 7);
    assert.equal(model.attemptedCompetencies, 2);
    assert.equal(model.masteryDenominator, 25);
    assert.equal(model.masteryPercent, 28);
  });

  it("withholds the claim when more are mastered than the total admits exist", () => {
    const model = masteredTwice({
      competencies_mastered_count: 7,
      total_competencies_count: 3,
    });

    assert.equal(model.hasPublishedCompetencyTotal, false);
    assert.equal(model.allCompetenciesMastered, false);
    // Never a fraction greater than one, whatever the two counts disagree about.
    assert.equal(model.masteryDenominator, 7);
    assert.equal(model.masteryPercent, 100);
  });

  it("allows the claim when the API's mastered figure meets the published total", () => {
    const model = masteredTwice({
      competencies_mastered_count: 25,
      total_competencies_count: 25,
    });

    assert.equal(model.allCompetenciesMastered, true);
    assert.equal(model.masteryPercent, 100);
  });
});

describe("Module denominator", () => {
  it("takes the learner's own assigned-path total from the API", () => {
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({ total_modules_count: 5 }),
    });

    assert.equal(model.totalModules, 5);
    assert.equal(model.moduleCompletionPercent, 60);
  });

  it("counts the learner's own path rows when the count is absent", () => {
    const { total_modules_count: _omitted, ...withoutTotal } = mockProgress();
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: withoutTotal,
      pathItems: [
        { id: "p1", status: "completed", module: { id: "m1", title: "Fractions" } },
        { id: "p2", status: "in_progress", module: { id: "m2", title: "Decimals" } },
        { id: "p3", status: "locked", module: { id: "m3", title: "Ratio" } },
        { id: "p4", status: "available", module: { id: "m4", title: "Percent" } },
      ],
    });

    assert.equal(model.totalModules, 4);
  });

  it("never reports fewer assigned modules than the learner has finished", () => {
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({ modules_completed_count: 9, total_modules_count: 4 }),
    });

    assert.equal(model.totalModules, 9);
    assert.equal(model.moduleCompletionPercent, 100);
  });
});

describe("Learning history de-duplication", () => {
  const ATTEMPT_DATE = "2026-09-01T10:00:00Z";

  it("records an attempt once even though the API reports it in two places", () => {
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({
        competencies: [{
          competency_id: COMPETENCY_ID_1,
          competency_name: "Integer Addition and Subtraction",
          current_score: 80,
          mastery_band: "Mastered",
          trajectory: [
            { date: ATTEMPT_DATE, score: 80, label: "Unit Assessment" },
          ],
        }],
        recent_activity: [
          {
            date: ATTEMPT_DATE,
            label: "Unit Assessment",
            score: 80,
            title: "Unit Assessment: Integers",
          },
        ],
      }),
    });

    assert.equal(model.history.assessments.length, 1);
    // The recent-activity copy survives, because it is the one that carries
    // the resource's real title.
    assert.equal(model.history.assessments[0].title, "Unit Assessment: Integers");
  });

  it("keeps an attempt that only the competency trajectory reported", () => {
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({
        competencies: [{
          competency_id: COMPETENCY_ID_1,
          competency_name: "Integer Addition and Subtraction",
          current_score: 80,
          mastery_band: "Mastered",
          trajectory: [
            { date: ATTEMPT_DATE, score: 80, label: "Unit Assessment" },
            { date: "2026-07-01T10:00:00Z", score: 40, label: "Diagnostic Baseline" },
          ],
        }],
        recent_activity: [
          {
            date: ATTEMPT_DATE,
            label: "Unit Assessment",
            score: 80,
            title: "Unit Assessment: Integers",
          },
        ],
      }),
    });

    assert.equal(model.history.assessments.length, 2);
    // Newest first, so the de-duplicated September row leads the July one.
    assert.deepEqual(
      model.history.assessments.map((row) => row.scoreFormatted),
      ["80%", "40%"],
    );
  });

  it("does not collapse two competencies that were assessed identically", () => {
    const sharedRow = { date: ATTEMPT_DATE, score: 75, label: "Unit Assessment" };
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({
        competencies: [
          {
            competency_id: COMPETENCY_ID_1,
            competency_name: "Integer Addition",
            mastery_band: "Developing",
            trajectory: [{ ...sharedRow }],
          },
          {
            competency_id: COMPETENCY_ID_2,
            competency_name: "Integer Division",
            mastery_band: "Developing",
            trajectory: [{ ...sharedRow }],
          },
        ],
        recent_activity: [
          { ...sharedRow, title: "Unit Assessment: Integers", resource_id: "act-1" },
          { ...sharedRow, title: "Unit Assessment: Integers", resource_id: "act-1" },
        ],
      }),
    });

    assert.equal(model.history.assessments.length, 2);
  });

  it("gives repeated attempts at one activity distinct keys", () => {
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({
        competencies: [],
        recent_activity: [
          { date: ATTEMPT_DATE, label: "Practice", score: 60, resource_id: "act-1" },
          { date: "2026-09-02T10:00:00Z", label: "Practice", score: 80, resource_id: "act-1" },
        ],
      }),
    });

    const ids = model.history.activities.map((row) => row.id);
    assert.equal(new Set(ids).size, 2);
  });

  it("does not print a path status where every other row prints a date", () => {
    const model = buildProgressModel({
      learner: mockLearner(),
      progress: mockProgress({ recent_activity: [] }),
      pathItems: [
        { id: "p1", status: "completed", module: { id: "m1", title: "Fractions" } },
      ],
    });

    assert.equal(model.history.modules.length, 1);
    assert.equal(model.history.modules[0].dateFormatted, "No date recorded");
  });
});
