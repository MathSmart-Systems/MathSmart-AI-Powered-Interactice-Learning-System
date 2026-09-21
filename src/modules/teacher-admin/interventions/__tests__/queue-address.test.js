import test from "node:test";
import assert from "node:assert/strict";

import {
  activeFilterCount,
  advancedFilterCount,
  caseHref,
  emptyFilters,
  filtersFromQuery,
  filtersToQuery,
  queueHref,
} from "../utils/intervention-helpers.js";

/**
 * The queue's filters live in the address.
 *
 * A case is its own page, so narrowing the queue and opening a case is a real
 * navigation. These are the rules that make the trip survivable: the address
 * says what is filtered, a row link carries it, the way back restores it, and
 * nothing a person can type into the bar breaks the queue.
 */

test("an empty query reads as no filters at all", () => {
  assert.deepEqual(filtersFromQuery(new URLSearchParams("")), emptyFilters());
  assert.deepEqual(filtersFromQuery(null), emptyFilters());
  assert.deepEqual(filtersFromQuery(undefined), emptyFilters());
});

test("a filter set survives a round trip through the address", () => {
  const filters = {
    ...emptyFilters(),
    severity: "HIGH",
    status: "In Progress",
    competencyId: "comp-1",
    sectionId: "section-1",
    dateFrom: "2026-09-01",
    minAttempts: "3",
  };

  const round = filtersFromQuery(new URLSearchParams(filtersToQuery(filters)));

  assert.deepEqual(round, filters);
});

test("unset filters are left out of the address rather than written empty", () => {
  const query = filtersToQuery({ ...emptyFilters(), severity: "LOW" });

  assert.equal(query, "severity=LOW");
});

test("the same filter set always produces the same address", () => {
  const one = filtersToQuery({ severity: "HIGH", status: "Resolved" });
  const two = filtersToQuery({ status: "Resolved", severity: "HIGH" });

  assert.equal(one, two);
});

test("a query somebody typed cannot break the queue", () => {
  const filters = filtersFromQuery(
    new URLSearchParams("severity=&status=%20&unknown=1&attempts=3"),
  );

  assert.equal(filters.severity, null);
  assert.equal(filters.status, null);
  assert.equal(filters.minAttempts, "3");
  assert.equal(Object.keys(filters).length, Object.keys(emptyFilters()).length);
});

test("the advanced count is only the filters behind the disclosure", () => {
  const filters = {
    ...emptyFilters(),
    severity: "HIGH",
    status: "In Progress",
    dateFrom: "2026-09-01",
    minScoreDrop: "20",
  };

  // Two are on screen and two are behind the disclosure. The badge counts the
  // ones a collapsed panel would otherwise hide.
  assert.equal(advancedFilterCount(filters), 2);
  assert.equal(activeFilterCount(filters), 4);
});

test("nothing applied counts as nothing", () => {
  assert.equal(advancedFilterCount(emptyFilters()), 0);
  assert.equal(activeFilterCount(emptyFilters()), 0);
  assert.equal(advancedFilterCount(null), 0);
  assert.equal(activeFilterCount(undefined), 0);
});

test("the queue's own address carries the filters applied to it", () => {
  assert.equal(queueHref(emptyFilters()), "/teacher/interventions");
  assert.equal(
    queueHref({ ...emptyFilters(), severity: "HIGH" }),
    "/teacher/interventions?severity=HIGH",
  );
});

test("a case link carries the queue it was opened from", () => {
  const filters = { ...emptyFilters(), severity: "HIGH", sectionId: "section-1" };

  const review = caseHref("case-1", filters);

  assert.ok(review.startsWith("/teacher/interventions/case-1?"));
  assert.deepEqual(
    filtersFromQuery(new URLSearchParams(review.split("?")[1])),
    filters,
  );
});

test("recording an action names the part of the page it arrives at", () => {
  const record = caseHref("case-1", null, { at: "record" });

  assert.equal(record, "/teacher/interventions/case-1?at=record");
  // Review and Record action are the same page reached two ways, and the
  // address is what makes them different rather than identical.
  assert.notEqual(record, caseHref("case-1"));
  assert.equal(caseHref("case-1"), "/teacher/interventions/case-1");
});
