import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AVAILABILITY,
  availabilityPresentation,
  buildCatalogue,
  catalogueEntry,
  previewFromSummary,
  startRefusal,
  REFUSAL,
} from "../utils/catalogue.js";

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  grade_id: "22222222-2222-4222-8222-222222222222",
  title: "Grade 6 Mathematics Diagnostic",
  type: "diagnostic",
  status: "published",
  duration_minutes: 60,
  description: "Find out where to start.",
  total_questions: 20,
  attempt_count: 0,
  latest_attempt_id: null,
  latest_status: null,
  availability: AVAILABILITY.AVAILABLE,
};

describe("availabilityPresentation", () => {
  it("offers a paper the learner has not sat", () => {
    const presentation = availabilityPresentation(AVAILABILITY.AVAILABLE);

    assert.equal(presentation.canOpen, true);
    assert.equal(presentation.verb, "Start");
  });

  it("invites a learner back into an attempt already open", () => {
    assert.equal(availabilityPresentation(AVAILABILITY.IN_PROGRESS).verb, "Continue");
  });

  it("says a finished paper is finished rather than offering it again", () => {
    const presentation = availabilityPresentation(AVAILABILITY.COMPLETED);

    assert.equal(presentation.canOpen, false);
    assert.equal(presentation.label, "Finished");
  });

  it("opens a retake only when the teacher has authorised one", () => {
    assert.equal(availabilityPresentation(AVAILABILITY.REASSESSMENT).canOpen, true);
  });

  it("treats a status it has never heard of as closed", () => {
    // Failing open would invite a child into something the server is about to
    // refuse, which is worse than a card with no button.
    const presentation = availabilityPresentation("something_new");

    assert.equal(presentation.canOpen, false);
    assert.equal(presentation.label, "Not available");
  });

  it("treats a missing status as closed too", () => {
    assert.equal(availabilityPresentation(undefined).canOpen, false);
  });
});

describe("catalogueEntry", () => {
  it("carries what a card has to show", () => {
    const entry = catalogueEntry(ROW);

    assert.equal(entry.title, "Grade 6 Mathematics Diagnostic");
    assert.equal(entry.typeLabel, "Diagnostic");
    assert.equal(entry.totalQuestions, 20);
    assert.equal(entry.durationMinutes, 60);
    assert.equal(entry.canOpen, true);
  });

  it("sends an open paper to its player", () => {
    assert.equal(
      catalogueEntry(ROW).href,
      "/student/assessments/11111111-1111-4111-8111-111111111111",
    );
  });

  it("sends a finished paper to its report", () => {
    const entry = catalogueEntry({
      ...ROW,
      availability: AVAILABILITY.COMPLETED,
      latest_attempt_id: "33333333-3333-4333-8333-333333333333",
    });

    assert.equal(
      entry.href,
      "/student/assessments/11111111-1111-4111-8111-111111111111?attempt=33333333-3333-4333-8333-333333333333",
    );
  });

  it("gives a finished paper with no attempt nowhere to go", () => {
    // Better than a control that leads to a report that is not there.
    const entry = catalogueEntry({ ...ROW, availability: AVAILABILITY.COMPLETED });

    assert.equal(entry.href, null);
  });

  it("drops a row with no identifier rather than rendering a dead card", () => {
    assert.equal(catalogueEntry({ ...ROW, id: null }), null);
    assert.equal(catalogueEntry(null), null);
    assert.equal(catalogueEntry("not a row"), null);
  });

  it("names an untitled paper rather than showing an empty card", () => {
    assert.equal(catalogueEntry({ ...ROW, title: "" }).title, "Untitled assessment");
  });

  it("reads a missing count as zero rather than as NaN", () => {
    const entry = catalogueEntry({ ...ROW, total_questions: null, duration_minutes: null });

    assert.equal(entry.totalQuestions, 0);
    assert.equal(entry.durationMinutes, 0);
  });
});

describe("buildCatalogue", () => {
  it("puts the diagnostic first, then what is open, then what is done", () => {
    const catalogue = buildCatalogue([
      { ...ROW, id: "a", title: "Zebra quiz", type: "unit_quiz" },
      {
        ...ROW,
        id: "b",
        title: "Old quiz",
        type: "unit_quiz",
        availability: AVAILABILITY.COMPLETED,
        latest_attempt_id: "att",
      },
      { ...ROW, id: "c", title: "Diagnostic", type: "diagnostic" },
    ]);

    assert.deepEqual(
      catalogue.map((entry) => entry.title),
      ["Diagnostic", "Zebra quiz", "Old quiz"],
    );
  });

  it("orders papers of equal standing by title, so the list does not reshuffle", () => {
    const catalogue = buildCatalogue([
      { ...ROW, id: "a", title: "Beta", type: "unit_quiz" },
      { ...ROW, id: "b", title: "Alpha", type: "unit_quiz" },
    ]);

    assert.deepEqual(
      catalogue.map((entry) => entry.title),
      ["Alpha", "Beta"],
    );
  });

  it("survives a payload that is not a list", () => {
    assert.deepEqual(buildCatalogue(null), []);
    assert.deepEqual(buildCatalogue(undefined), []);
    assert.deepEqual(buildCatalogue({}), []);
  });

  it("skips unusable rows without losing the usable ones", () => {
    const catalogue = buildCatalogue([null, ROW, { id: null }]);

    assert.equal(catalogue.length, 1);
  });
});

describe("previewFromSummary", () => {
  it("reads an untouched paper as not started", () => {
    const preview = previewFromSummary(ROW);

    assert.equal(preview.diagnostic_status, "not_started");
    assert.equal(preview.reassessment_eligible, false);
    assert.equal(preview.total_questions, 20);
  });

  it("reads an open attempt as in progress", () => {
    const preview = previewFromSummary({
      ...ROW,
      availability: AVAILABILITY.IN_PROGRESS,
      latest_status: "in_progress",
    });

    assert.equal(preview.diagnostic_status, "in_progress");
  });

  it("reads a finished paper as completed and not retakeable", () => {
    const preview = previewFromSummary({ ...ROW, availability: AVAILABILITY.COMPLETED });

    assert.equal(preview.diagnostic_status, "completed");
    assert.equal(preview.reassessment_eligible, false);
  });

  it("reads an authorised retake as completed and retakeable", () => {
    const preview = previewFromSummary({ ...ROW, availability: AVAILABILITY.REASSESSMENT });

    assert.equal(preview.diagnostic_status, "completed");
    assert.equal(preview.reassessment_eligible, true);
  });

  it("falls back to an hour when a paper carries no duration", () => {
    // The player needs some deadline to count down to; guessing sixty minutes
    // is better than counting down from zero.
    assert.equal(previewFromSummary({ ...ROW, duration_minutes: 0 }).time_limit_minutes, 60);
  });

  it("carries the teacher's retake reason when the standing supplies one", () => {
    const preview = previewFromSummary(
      { ...ROW, availability: AVAILABILITY.REASSESSMENT },
      { reassessment_reason: "Absent on the day." },
    );

    assert.equal(preview.reassessment_reason, "Absent on the day.");
  });

  it("returns nothing for a row it cannot identify", () => {
    assert.equal(previewFromSummary({ ...ROW, id: null }), null);
  });
});

describe("a paper the server cannot deliver", () => {
  it("never tells a learner a not-ready paper is ready to start", () => {
    const presentation = availabilityPresentation(AVAILABILITY.NOT_READY);

    assert.equal(presentation.canOpen, false);
    assert.equal(presentation.label, "Not ready yet");
    assert.notEqual(presentation.label, "Ready to start");
  });

  it("says whose doing it is, so a learner does not think they broke it", () => {
    assert.match(availabilityPresentation(AVAILABILITY.NOT_READY).reason, /teacher/i);
  });

  it("gives a not-ready paper nowhere to go", () => {
    // Not even to a report: there is no attempt behind it to read.
    const entry = catalogueEntry({
      ...ROW,
      availability: AVAILABILITY.NOT_READY,
      latest_attempt_id: "33333333-3333-4333-8333-333333333333",
    });

    assert.equal(entry.href, null);
    assert.equal(entry.canOpen, false);
  });

  it("wins over an availability that would have offered a start", () => {
    // The API resolves this itself, but a row that says `is_ready: false`
    // beside an older label is still stating what a start would do.
    for (const availability of [
      AVAILABILITY.AVAILABLE,
      AVAILABILITY.IN_PROGRESS,
      AVAILABILITY.REASSESSMENT,
    ]) {
      const entry = catalogueEntry({ ...ROW, availability, is_ready: false });

      assert.equal(entry.availability, AVAILABILITY.NOT_READY);
      assert.equal(entry.canOpen, false);
      assert.equal(entry.href, null);
    }
  });

  it("does not win over a paper the learner has already finished", () => {
    // A finished paper has a report, and that report does not stop existing
    // because a question was archived out of the paper afterwards.
    const entry = catalogueEntry({
      ...ROW,
      availability: AVAILABILITY.COMPLETED,
      is_ready: false,
      latest_attempt_id: "33333333-3333-4333-8333-333333333333",
    });

    assert.equal(entry.availability, AVAILABILITY.COMPLETED);
    assert.equal(entry.label, "Finished");
    assert.equal(
      entry.href,
      "/student/assessments/11111111-1111-4111-8111-111111111111?attempt=33333333-3333-4333-8333-333333333333",
    );
  });

  it("tells the player before it offers a button that cannot work", () => {
    assert.equal(previewFromSummary(ROW).is_ready, true);
    assert.equal(
      previewFromSummary({ ...ROW, availability: AVAILABILITY.NOT_READY }).is_ready,
      false,
    );
  });
});

describe("startRefusal", () => {
  it("names an unfinished paper as unfinished rather than as a fault", () => {
    const refusal = startRefusal({ status: 409, code: "assessment_not_ready" });

    assert.equal(refusal.kind, REFUSAL.NOT_READY);
    assert.equal(refusal.isFault, false);
    assert.match(refusal.title, /not ready/i);
  });

  it("names a sitting the learner is not entitled to as closed, not broken", () => {
    assert.equal(startRefusal({ status: 412 }).kind, REFUSAL.LOCKED);
    assert.equal(
      startRefusal({ status: 403, code: "reassessment_not_authorized" }).kind,
      REFUSAL.LOCKED,
    );
  });

  it("names a missing paper as missing", () => {
    assert.equal(startRefusal({ status: 404 }).kind, REFUSAL.MISSING);
    assert.equal(startRefusal({ status: 404 }).isFault, false);
  });

  it("keeps the marking-pen red for something that genuinely broke", () => {
    assert.equal(startRefusal({ status: 500 }).kind, REFUSAL.FAULT);
    assert.equal(startRefusal({}).isFault, true);
    assert.equal(startRefusal().isFault, true);
  });
});
