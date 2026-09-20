import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDate, formatUpdated, rangeLabel } from "../utils/format.js";
import { QUESTION_BANK_PATH, questionBankUrl } from "../utils/urls.js";

describe("questionBankUrl", () => {
  it("always names the publication state and the page", () => {
    assert.equal(questionBankUrl(), `${QUESTION_BANK_PATH}?status=published&page=1`);
  });

  it("carries every filter that is set, and none that is not", () => {
    assert.equal(
      questionBankUrl({
        search: "integers",
        status: "draft",
        competencyId: "c-1",
        questionType: "number_input",
        difficulty: "hard",
        page: 3,
      }),
      `${QUESTION_BANK_PATH}?search=integers&status=draft&competency_id=c-1` +
        "&type=number_input&difficulty=hard&page=3",
    );
  });

  it("drops a blank filter rather than sending it empty", () => {
    // The API types these as enums, so `type=` is a 422 rather than "no
    // filter". A caption that says a filter is off has to mean the parameter
    // is absent.
    assert.equal(
      questionBankUrl({ status: "archived", competencyId: "", questionType: "", difficulty: "" }),
      `${QUESTION_BANK_PATH}?status=archived&page=1`,
    );
  });

  it("keeps the filters when only the page moves", () => {
    const first = questionBankUrl({ search: "sign rules", status: "draft", page: 1 });
    const second = questionBankUrl({ search: "sign rules", status: "draft", page: 2 });

    assert.ok(first.includes("search=sign+rules"));
    assert.ok(second.includes("search=sign+rules"));
    assert.ok(second.endsWith("page=2"));
  });
});

describe("rangeLabel", () => {
  it("names the state it is counting, because the list shows only that state", () => {
    // The caption used to count every status while the rows above it showed
    // one. Both numbers now come from the same filtered read.
    assert.equal(
      rangeLabel({ page: 3, pageSize: 20, totalItems: 118, statusLabel: "Published" }),
      "Showing 41–60 of 118 published questions",
    );
  });

  it("stops the last page at the total", () => {
    assert.equal(
      rangeLabel({ page: 12, pageSize: 10, totalItems: 118, statusLabel: "Draft" }),
      "Showing 111–118 of 118 draft questions",
    );
  });

  it("starts at one on the first page", () => {
    assert.equal(
      rangeLabel({ page: 1, pageSize: 10, totalItems: 4, statusLabel: "Archived" }),
      "Showing 1–4 of 4 archived questions",
    );
  });

  it("says nothing is there rather than counting to zero", () => {
    assert.equal(
      rangeLabel({ page: 1, pageSize: 10, totalItems: 0, statusLabel: "Published" }),
      "No published questions",
    );
  });

  it("falls back to plain questions when no state is named", () => {
    assert.equal(rangeLabel({ page: 1, pageSize: 10, totalItems: 3 }), "Showing 1–3 of 3 questions");
  });
});

describe("formatDate", () => {
  it("reads a timestamp in the one timezone MathSmart teaches in", () => {
    // Pinned so a server render and a browser render of the same row cannot
    // disagree about which day a late edit fell on, and so this screen agrees
    // with the module list, which has always pinned it.
    assert.equal(formatDate("2026-09-13T20:30:00Z"), "Sep 14, 2026");
  });

  it("returns an unparsable value untouched", () => {
    assert.equal(formatDate("not a date"), "not a date");
  });

  it("has nothing to say about a missing value", () => {
    assert.equal(formatDate(null), null);
    assert.equal(formatUpdated(null), null);
  });

  it("prefixes a row footer", () => {
    assert.equal(formatUpdated("2026-09-13T01:00:00Z"), "Updated Sep 13, 2026");
  });
});
