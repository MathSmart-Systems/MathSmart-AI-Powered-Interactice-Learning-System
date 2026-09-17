import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboardModel,
  extractInitials,
  formatNumber,
  formatPercentage,
  getCompetencyMasteryBand,
  normalizeCompetencies,
  normalizePriorityLearners,
  normalizeTotals,
} from "../utils/dashboard-model.js";

test("formatNumber handles valid numbers and fallbacks", () => {
  assert.equal(formatNumber(42), 42);
  assert.equal(formatNumber("15.7"), 16);
  assert.equal(formatNumber(null), 0);
  assert.equal(formatNumber(undefined), 0);
  assert.equal(formatNumber("invalid"), 0);
});

test("formatPercentage formats numbers into percentage strings", () => {
  assert.equal(formatPercentage(75), "75%");
  assert.equal(formatPercentage(88.4), "88%");
  assert.equal(formatPercentage(null), "—");
  assert.equal(formatPercentage(undefined), "—");
  assert.equal(formatPercentage("bad"), "—");
});

test("extractInitials extracts two letters or fallback", () => {
  assert.equal(extractInitials("Juan Dela Cruz"), "JC");
  assert.equal(extractInitials("Maria Santos"), "MS");
  assert.equal(extractInitials("Pedro"), "PE");
  assert.equal(extractInitials(""), "?");
  assert.equal(extractInitials(null), "?");
});

test("getCompetencyMasteryBand classifies scores accurately", () => {
  assert.equal(getCompetencyMasteryBand(85), "Mastered");
  assert.equal(getCompetencyMasteryBand(75), "Mastered");
  assert.equal(getCompetencyMasteryBand(65), "Developing");
  assert.equal(getCompetencyMasteryBand(60), "Developing");
  assert.equal(getCompetencyMasteryBand(59), "Needs Support");
  assert.equal(getCompetencyMasteryBand(0), "Needs Support");
  assert.equal(getCompetencyMasteryBand(null), "Not Started");
});

test("normalizeTotals maps raw API totals to formatted view properties", () => {
  const raw = {
    learner_count: 40,
    needs_support_count: 9,
    active_count: 15,
    improving_count: 12,
    mastered_count: 4,
    average_mastery: 63.4,
    open_intervention_count: 5,
    published_competency_count: 8,
    scored_attempt_count: 120,
    completed_module_count: 32,
  };

  const totals = normalizeTotals(raw);
  assert.equal(totals.learnerCount, 40);
  assert.equal(totals.needsSupportCount, 9);
  assert.equal(totals.activeCount, 15);
  assert.equal(totals.masteredCount, 4);
  assert.equal(totals.averageMastery, 63.4);
  assert.equal(totals.averageMasteryFormatted, "63%");
  assert.equal(totals.openInterventionCount, 5);
});

test("normalizePriorityLearners preserves canonical status, intervention count, and identity", () => {
  const rawLearners = [
    {
      student_id: "stu-001",
      learner_id: "LRN-2026-001",
      full_name: "Juan Dela Cruz",
      section_name: "Rizal",
      diagnostic_score: 40,
      overall_mastery: 45,
      monitoring_status: "needs_intervention",
      active_intervention_count: 1,
    },
    {
      student_id: "stu-002",
      learner_id: "LRN-2026-002",
      full_name: "Maria Reyes",
      section_name: "Bonifacio",
      diagnostic_score: 60,
      overall_mastery: 65,
      monitoring_status: "active",
      active_intervention_count: 0,
    },
  ];

  const learners = normalizePriorityLearners(rawLearners);
  assert.equal(learners.length, 2);
  assert.equal(learners[0].studentId, "stu-001");
  assert.equal(learners[0].initials, "JC");
  assert.equal(learners[0].monitoringStatus, "needs_intervention");
  assert.equal(learners[0].activeInterventionCount, 1);
  assert.equal("severity" in learners[0], false);
  assert.equal(learners[0].attemptSummary, "1 active intervention");
  assert.equal(learners[1].initials, "MR");
  assert.equal(learners[1].monitoringStatus, "active");
  assert.equal(learners[1].activeInterventionCount, 0);
  assert.equal("severity" in learners[1], false);
});

test("normalizeCompetencies formats scores and respects small cohort privacy suppression", () => {
  const rawCompetencies = [
    {
      competency_id: "comp-01",
      code: "MATH6-INT-01",
      name: "Integer Addition",
      domain: "Number Sense",
      learners_tracked: 25,
      mastered_count: 15,
      developing_count: 8,
      needs_improvement_count: 2,
      average_current_score: 82.5,
    },
    {
      competency_id: "comp-02",
      code: "MATH6-GEO-01",
      name: "Geometry Fundamentals",
      domain: "Geometry",
      learners_tracked: 2,
      mastered_count: 0,
      developing_count: 1,
      needs_improvement_count: 1,
      average_current_score: null, // withheld by backend (cohort < 5)
      suppressed: true,            // backend sets this flag explicitly
    },
  ];

  const competencies = normalizeCompetencies(rawCompetencies);
  assert.equal(competencies.length, 2);
  assert.equal(competencies[0].averageFormatted, "83%");
  assert.equal(competencies[0].isSuppressed, false);
  assert.equal(competencies[0].masteryBand, "Mastered");

  assert.equal(competencies[1].averageFormatted, "Withheld (Small Cohort)");
  assert.equal(competencies[1].isSuppressed, true);
  assert.equal(competencies[1].masteryBand, "Not Started");
});

test("buildDashboardModel aggregates totals, sections, and selection state", () => {
  const model = buildDashboardModel({
    totals: { learner_count: 20 },
    sections: [{ id: "sec-01", name: "Rizal", learner_count: 20 }],
    selectedSectionId: "sec-01",
  });

  assert.equal(model.hasData, true);
  assert.equal(model.totals.learnerCount, 20);
  assert.equal(model.sections.length, 1);
  assert.equal(model.selectedSection?.name, "Rizal");
});

test("buildDashboardModel handles empty data safely", () => {
  const model = buildDashboardModel();
  assert.equal(model.hasData, false);
  assert.equal(model.totals.learnerCount, 0);
  assert.equal(model.competencies.length, 0);
  assert.equal(model.priorityLearners.length, 0);
  assert.equal(model.sections.length, 0);
  assert.equal(model.selectedSection, null);
});
