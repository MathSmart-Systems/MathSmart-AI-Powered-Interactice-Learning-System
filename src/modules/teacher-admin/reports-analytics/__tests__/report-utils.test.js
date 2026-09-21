/**
 * Report filters, the report model and the AI summary, as pure functions.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apiParams,
  isoDate,
  readReportFilters,
  reportQuery,
  summaryBody,
  withFilter,
} from "../utils/report-filters.js";
import {
  COMPETENCY_PREVIEW,
  buildReportModel,
  pageCount,
  showGrowth,
  showPercent,
} from "../utils/report-model.js";
import { SUMMARY_REFRESH_FAILED, readSummary, settleSummary } from "../utils/report-summary.js";

const SECTION = "610fe29e-540b-49ab-bca4-d49da5fa3fe9";
const COMPETENCY = "d69d6516-879f-4e01-9785-03786ddfbf8a";

describe("readReportFilters", () => {
  it("keeps real values and drops everything else", () => {
    const filters = readReportFilters({
      section: SECTION.toUpperCase(),
      competency: "not-a-uuid",
      status: "expelled",
      from: "2026-02-30",
      to: "2026-09-30",
      page: "abc",
    });
    assert.deepEqual(filters, {
      sectionId: SECTION,
      competencyId: null,
      status: null,
      from: null,
      to: "2026-09-30",
      page: 1,
    });
  });

  it("drops an end date before the start", () => {
    const filters = readReportFilters(new URLSearchParams("from=2026-09-10&to=2026-09-01"));
    assert.equal(filters.from, "2026-09-10");
    assert.equal(filters.to, null);
  });

  it("round-trips through the address", () => {
    const filters = {
      sectionId: SECTION,
      competencyId: COMPETENCY,
      status: "needs_intervention",
      from: "2026-09-01",
      to: "2026-09-30",
      page: 2,
    };
    assert.deepEqual(readReportFilters(new URLSearchParams(reportQuery(filters).slice(1))), filters);
    assert.equal(reportQuery({ page: 1 }), "");
  });

  it("speaks the API's names, with or without the page", () => {
    const filters = { sectionId: SECTION, status: "mastered", page: 3 };
    assert.equal(apiParams(filters).toString(), `section_id=${SECTION}&status=mastered&page=3`);
    assert.equal(apiParams(filters, { page: false }).get("page"), null);
    assert.deepEqual(summaryBody(filters), {
      section_id: SECTION,
      competency_id: null,
      status: "mastered",
      from: null,
      to: null,
    });
  });

  it("a changed filter starts the list again", () => {
    assert.equal(withFilter({ page: 4 }, "status", "mastered").page, 1);
  });

  it("isoDate refuses a date that does not exist", () => {
    assert.equal(isoDate("2026-02-29"), null);
    assert.equal(isoDate("2028-02-29"), "2028-02-29");
  });
});

const OVERVIEW = {
  privacy: { minimum_learners_for_average: 5 },
  summary: {
    learner_count: 7,
    needs_support_count: 0,
    diagnostic: { not_started: 0, in_progress: 0, completed: 7 },
    average_current: 44.9,
    average_diagnostic: 46.43,
    average_growth: -1.53,
    averages_suppressed: false,
  },
  competencies: Array.from({ length: 8 }, (_, index) => ({
    competency_id: `c${index}`,
    code: `C${index}`,
    name: `Competency ${index}`,
    learners_tracked: index < 6 ? 7 : 0,
    mastered_count: 2,
    developing_count: 0,
    needs_improvement_count: index < 6 ? 5 : 0,
    average_current: index < 6 ? 28.57 : null,
    growth: 0,
    average_band: "Needs Improvement",
    suppressed: index >= 6,
  })),
  sections: [{ section_id: SECTION, name: "Sampaguita", learner_count: 3, suppressed: true }],
  activity: { assessments_scored: 0, activity_attempts: 4, activity_average: null },
  most_missed: [],
  interventions: { needs_intervention: 0, in_progress: 2, resolved: 1, median_days_to_resolve: null },
  watch_list: { rows: [], total: 23, page: 1, page_size: 10 },
};

describe("buildReportModel", () => {
  const model = buildReportModel(OVERVIEW);

  it("shows real zeros as 0", () => {
    assert.equal(model.summary.needsSupport, 0);
    assert.equal(model.interventions.needsIntervention, 0);
    assert.equal(model.activity.assessmentsScored, 0);
  });

  it("previews the five competencies in greatest need, with a total for View all", () => {
    assert.equal(model.competencies.preview.length, COMPETENCY_PREVIEW);
    assert.deepEqual(
      model.competencies.preview.map((row) => row.code),
      ["C0", "C1", "C2", "C3", "C4"],
    );
    assert.equal(model.competencies.total, 8);
    assert.equal(model.competencies.withProgress, 6);
  });

  it("says Hidden for a withheld average and never shows the number", () => {
    assert.equal(model.sections[0].average, "Hidden");
    assert.equal(model.activity.activityAverage, "Hidden");
    assert.equal(model.competencies.all[7].average, "Hidden");
  });

  it("rounds for display the same way everywhere", () => {
    assert.equal(model.summary.averageCurrent, "45%");
    assert.equal(model.summary.growth, "−2 pts");
    assert.equal(showPercent(null), "—");
    assert.equal(showGrowth(0), "0 pts");
    assert.equal(showGrowth(14.2), "+14 pts");
  });

  it("counts pages from the server's total", () => {
    assert.equal(pageCount(model.watchList), 3);
  });

  it("a missing reply is missing, not zero", () => {
    const empty = buildReportModel(null);
    assert.equal(empty.summary.learners, null);
    assert.equal(empty.summary.averageCurrent, "—");
    assert.equal(empty.isEmpty, false);
  });
});

describe("the AI summary", () => {
  const good = { ok: true, data: { overview: "Most learners are developing.", patterns: ["a", "b", "c"], actions: [] } };

  it("reads the structured reply and nothing else", () => {
    assert.deepEqual(readSummary(good), {
      overview: "Most learners are developing.",
      patterns: ["a", "b"],
      actions: [],
    });
    assert.equal(readSummary({ ok: true, data: { overview: "  " } }), null);
    assert.equal(readSummary({ ok: true, data: { overview: "x", provider: "groq", model: "m" } }).provider, undefined);
  });

  it("keeps the previous summary when asking again fails", () => {
    const previous = { summary: readSummary(good) };
    const settled = settleSummary(previous, { ok: false, status: 503 });
    assert.deepEqual(settled.summary, previous.summary);
    assert.equal(settled.failure, SUMMARY_REFRESH_FAILED);
  });

  it("explains a first failure in place", () => {
    const settled = settleSummary({ summary: null }, { ok: false, status: 503 });
    assert.equal(settled.summary, null);
    assert.match(settled.reason, /complete without one/);
  });
});
