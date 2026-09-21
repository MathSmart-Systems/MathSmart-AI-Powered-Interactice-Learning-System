import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboardModel,
  count,
  initials,
  monitoringLabel,
  percent,
  show,
  weakestFirst,
} from "../utils/dashboard-model.js";
import { PREVIEW, TEACHER_ROUTES } from "../utils/constants.js";

const DASHBOARD = {
  totals: {
    learner_count: 40,
    section_count: 3,
    average_mastery: 62.67,
    needs_support_count: 9,
  },
  diagnostic: { not_started: 5, in_progress: 2, completed: 33 },
  interventions: { needs_intervention: 2, in_progress: 3, resolved: 7 },
  priority_learners: Array.from({ length: 9 }, (_, index) => ({
    student_id: `s-${index}`,
    full_name: `Learner ${index}`,
    section_name: "Rizal",
    monitoring_status: "needs_intervention",
    diagnostic_score: 40,
    overall_mastery: 35.5,
    active_intervention_count: 1,
  })),
  competencies: [
    { competency_id: "c1", code: "A", name: "Strong", learners_tracked: 8, needs_improvement_count: 0, average_current_score: 90, average_mastery_band: "Mastered" },
    { competency_id: "c2", code: "B", name: "Weak", learners_tracked: 9, needs_improvement_count: 6, average_current_score: 41, average_mastery_band: "Needs Improvement" },
    { competency_id: "c3", code: "C", name: "Hidden", learners_tracked: 2, needs_improvement_count: 2, average_current_score: null, suppressed: true },
    { competency_id: "c4", code: "D", name: "Untouched", learners_tracked: 0, needs_improvement_count: 0 },
  ],
  recent_activity: [
    { kind: "assessment", id: "a1", full_name: "Ana", title: "Diagnostic", score: 72.4, occurred_at: "2026-09-21T01:00:00Z" },
  ],
};

test("a missing count is unknown, not zero", () => {
  // The previous helper turned null into 0 for every count on the page, so a
  // partial reply read as "nobody needs help".
  assert.equal(count(null), null);
  assert.equal(count(undefined), null);
  assert.equal(count("nope"), null);
  assert.equal(count(0), 0);
  assert.equal(count(7), 7);
});

test("show prints zero as zero and unknown as a dash", () => {
  assert.equal(show(0), "0");
  assert.equal(show(null), "—");
  assert.equal(show(12, "%"), "12%");
});

test("percentages are rounded once, the same way everywhere", () => {
  assert.equal(percent(62.67), 63);
  assert.equal(percent(null), null);
});

test("initials survive odd names", () => {
  assert.equal(initials("Ana Dela Cruz"), "AC");
  assert.equal(initials("Ana"), "A");
  assert.equal(initials(""), "?");
});

test("a learner with no status is not invented a status", () => {
  assert.equal(monitoringLabel(null), null);
  assert.equal(monitoringLabel("needs_intervention"), "Needs support");
});

test("the summary carries every figure the page shows", () => {
  const model = buildDashboardModel({ dashboard: DASHBOARD });

  assert.equal(model.summary.learners, 40);
  assert.equal(model.summary.sections, 3);
  assert.equal(model.summary.diagnosticCompleted, 33);
  assert.equal(model.summary.diagnosticInProgress, 2);
  assert.equal(model.summary.diagnosticNotStarted, 5);
  assert.equal(model.summary.averageMastery, 63);
});

test("interventions are counted by status, three numbers not one", () => {
  const model = buildDashboardModel({ dashboard: DASHBOARD });

  assert.deepEqual(model.interventions, { needsIntervention: 2, inProgress: 3, resolved: 7 });
});

test("a genuine zero in every aggregate is shown as 0, never as a dash", () => {
  const model = buildDashboardModel({
    dashboard: {
      totals: { learner_count: 0, section_count: 0 },
      diagnostic: { not_started: 0, in_progress: 0, completed: 0 },
      interventions: { needs_intervention: 0, in_progress: 0, resolved: 0 },
    },
  });

  assert.equal(show(model.summary.sections), "0");
  assert.equal(show(model.summary.diagnosticCompleted), "0");
  for (const value of Object.values(model.interventions)) assert.equal(show(value), "0");
});

test("the figures are read from the reply as given, not recounted here", () => {
  // Totals that could never be summed from the lists the reply also carries:
  // the page must print the API's own counts, not count rows itself.
  const model = buildDashboardModel({
    dashboard: {
      ...DASHBOARD,
      totals: { ...DASHBOARD.totals, section_count: 17 },
      interventions: { needs_intervention: 11, in_progress: 0, resolved: 4 },
    },
  });

  assert.equal(model.summary.sections, 17);
  assert.deepEqual(model.interventions, { needsIntervention: 11, inProgress: 0, resolved: 4 });
});

test("a reply missing the breakdown shows unknowns rather than zeros", () => {
  const model = buildDashboardModel({ dashboard: { totals: { learner_count: 4 } } });

  assert.equal(model.summary.sections, null);
  assert.equal(model.summary.diagnosticCompleted, null);
  assert.deepEqual(model.interventions, { needsIntervention: null, inProgress: null, resolved: null });
});

test("the support list is capped, and says how many more there are", () => {
  const model = buildDashboardModel({ dashboard: DASHBOARD });

  assert.equal(model.priority.total, 9);
  assert.equal(model.priority.shown.length, PREVIEW.PRIORITY_LEARNERS);
});

test("competencies are ordered weakest first, by the database's own figures", () => {
  const model = buildDashboardModel({ dashboard: DASHBOARD });

  assert.deepEqual(
    model.competencies.shown.map((competency) => competency.code),
    ["B", "C", "A"],
  );
});

test("a competency's band is the API's, never redrawn here", () => {
  const model = buildDashboardModel({ dashboard: DASHBOARD });
  const weak = model.competencies.shown.find((competency) => competency.code === "B");

  // 41 is "Needs Improvement" because the database says so. The previous
  // model drew its own bands at 75 and 60 and disagreed with the database.
  assert.equal(weak.band, "Needs Improvement");
});

test("a competency nobody has started is counted, not listed", () => {
  const model = buildDashboardModel({ dashboard: DASHBOARD });

  assert.ok(!model.competencies.shown.some((competency) => competency.code === "D"));
  assert.equal(model.competencies.untracked, 1);
});

test("the privacy note is raised once when any average is withheld", () => {
  const model = buildDashboardModel({ dashboard: DASHBOARD });

  assert.equal(model.competencies.anySuppressed, true);
});

test("weakestFirst puts unknown averages after known ones at equal need", () => {
  const ordered = weakestFirst([
    { code: "X", needsImprovement: 1, average: null },
    { code: "Y", needsImprovement: 1, average: 30 },
  ]);

  assert.deepEqual(ordered.map((item) => item.code), ["Y", "X"]);
});

test("an empty class is only empty when the reply said so", () => {
  assert.equal(buildDashboardModel({ dashboard: { totals: { learner_count: 0 } } }).isEmpty, true);
  // No reply at all is not an empty class; it is an unknown one.
  assert.equal(buildDashboardModel().isEmpty, false);
});

test("the selected section is only selected when it exists", () => {
  const sections = [{ id: "s1", name: "Rizal", learner_count: 0 }];

  const chosen = buildDashboardModel({ dashboard: DASHBOARD, sections, selectedSectionId: "s1" });
  const unknown = buildDashboardModel({ dashboard: DASHBOARD, sections, selectedSectionId: "gone" });

  assert.equal(chosen.selectedSection.name, "Rizal");
  // Zero learners is shown as zero, not hidden.
  assert.equal(chosen.sections[0].learnerCount, 0);
  assert.equal(unknown.selectedSection, null);
});

test("recent activity keeps the recorded score, rounded for display", () => {
  const model = buildDashboardModel({ dashboard: DASHBOARD });

  assert.equal(model.recentActivity[0].score, 72);
  assert.equal(model.recentActivity[0].kind, "assessment");
});

test("deep links go to real routes, not ignored query strings", () => {
  assert.equal(TEACHER_ROUTES.student("abc"), "/teacher/students/abc");
  assert.equal(TEACHER_ROUTES.learnerCases("abc"), "/teacher/interventions?student=abc");
});

test("an average the server withheld for a small cohort is marked withheld, not missing", () => {
  const model = buildDashboardModel({
    dashboard: { totals: { learner_count: 3, average_mastery: null, average_mastery_suppressed: true } },
  });
  assert.equal(model.summary.averageMastery, null);
  assert.equal(model.summary.averageMasteryWithheld, true);
});
