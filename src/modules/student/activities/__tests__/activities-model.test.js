/**
 * Unit tests for the activities domain model.
 *
 * They run on Node's own test runner (`npm run test:unit`), so the module under
 * test is imported with an explicit `.js` extension.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activityGate,
  buildActivityList,
  masteryBand,
  pathStatus,
  startRefusal,
  REFUSAL,
  toAttemptView,
  toOptions,
  toOutcomeView,
  toQuestionView,
  SUPPORTED_QUESTION_TYPES,
  QUESTION_TYPE,
} from "../utils/activities-model.js";

describe("pathStatus", () => {
  it("writes every learner status out in words", () => {
    assert.equal(pathStatus("locked").label, "Opens later");
    assert.equal(pathStatus("available").label, "Ready to start");
    assert.equal(pathStatus("available").verb, "Start");
    assert.equal(pathStatus("in_progress").label, "In progress");
    assert.equal(pathStatus("in_progress").verb, "Continue");
    assert.equal(pathStatus("completed").label, "Finished");
    assert.equal(pathStatus("completed").verb, "Review");
  });

  it("falls back to a neutral invitation for unknown statuses", () => {
    assert.equal(pathStatus(null).label, "Ready to start");
    assert.equal(pathStatus("weird").verb, "Open");
  });
});

describe("masteryBand", () => {
  it("reads the canonical band vocabulary like the dashboard does", () => {
    assert.equal(masteryBand("Mastered").label, "Mastered");
    assert.equal(masteryBand("Developing").label, "Developing");
    assert.equal(masteryBand("Needs Improvement").label, "Needs practice");
    assert.equal(masteryBand("Unset").label, "Not scored yet");
  });
});

describe("toOptions", () => {
  it("accepts plain strings and numbers", () => {
    assert.deepEqual(toOptions(["4", "-4"]), [
      { key: "4", label: "4" },
      { key: "-4", label: "-4" },
    ]);
    assert.deepEqual(toOptions([4, -4]), [
      { key: "4", label: "4" },
      { key: "-4", label: "-4" },
    ]);
  });

  it("reads { key, label } objects", () => {
    assert.deepEqual(
      toOptions([{ key: "a", label: "Addition" }, { id: "b", text: "Subtraction" }]),
      [
        { key: "a", label: "Addition" },
        { key: "b", label: "Subtraction" },
      ],
    );
  });

  it("drops unparseable entries and returns [] for non-arrays", () => {
    assert.deepEqual(toOptions([null, {}, { label: "no key" }]), []);
    assert.deepEqual(toOptions("nope"), []);
  });
});

describe("buildActivityList", () => {
  it("normalises a catalogue row into a card model", () => {
    const list = buildActivityList([
      {
        id: "act-1",
        module_id: "mod-1",
        module_title: "Integers",
        competency_id: "comp-1",
        competency_name: "Integer operations",
        title: "Sign Rules",
        description: "Practise signed multiplication.",
        estimated_minutes: 10,
        points: 20,
        mastery_threshold: 75,
        status: "published",
        attempt_count: 2,
        best_score: 82.5,
        path_status: "in_progress",
      },
    ]);

    assert.equal(list.length, 1);
    const item = list[0];
    assert.equal(item.activityId, "act-1");
    assert.equal(item.title, "Sign Rules");
    assert.equal(item.status.label, "In progress");
    assert.equal(item.attemptCount, 2);
    assert.equal(item.bestScore, 82.5);
  });

  it("drops rows without an id and tolerates a missing best score", () => {
    const list = buildActivityList([null, { id: "act-2", path_status: "locked" }, {}]);
    assert.equal(list.length, 1);
    assert.equal(list[0].activityId, "act-2");
    assert.equal(list[0].bestScore, null);
    assert.equal(list[0].attemptCount, 0);
  });
});

describe("toQuestionView", () => {
  it("shapes one activity with its questions and choices", () => {
    const view = toQuestionView({
      id: "act-1",
      competency_id: "comp-1",
      competency_name: "Integer operations",
      title: "Sign Rules",
      mastery_threshold: 75,
      path_status: "available",
      questions: [
        {
          id: "q-1",
          competency_id: "comp-1",
          competency_name: "Integer operations",
          text: "What is 4 × -3?",
          type: "multiple_choice",
          choices: ["-12", "12"],
          difficulty: "easy",
        },
        { id: "q-2", type: "number_input", text: "What is 8 ÷ 2?", choices: [], difficulty: "easy" },
      ],
    });

    assert.equal(view.questions.length, 2);
    assert.equal(view.questions[0].options[0].key, "-12");
    assert.equal(view.questions[1].position, 2);
    assert.equal(view.questions[1].type, QUESTION_TYPE.NUMBER_INPUT);
  });

  it("throws for a missing activity id", () => {
    assert.throws(() => toQuestionView({ title: "x" }), /could not be read/);
  });
});

describe("toAttemptView", () => {
  it("keeps saved answers keyed by question id", () => {
    const view = toAttemptView({
      attempt_id: "attempt-1",
      status: "in_progress",
      attempt_number: 2,
      saved_answers: { "q-1": "-12", "q-2": "4" },
      started_at: "2026-09-17T01:00:00Z",
    });
    assert.equal(view.attemptId, "attempt-1");
    assert.equal(view.attemptNumber, 2);
    assert.deepEqual(view.savedAnswers, { "q-1": "-12", "q-2": "4" });
  });

  it("throws when the attempt id is missing", () => {
    assert.throws(() => toAttemptView({ status: "in_progress" }), /could not be started/);
  });
});

describe("toOutcomeView", () => {
  it("normalises a scored outcome", () => {
    const view = toOutcomeView({
      attempt_id: "attempt-1",
      score: 8,
      max_score: 10,
      accuracy: 80,
      passed: true,
      attempt_number: 1,
      mastery_band: "Developing",
      previous_competency_score: 55,
      current_competency_score: 72,
      intervention_created: false,
      next_action: { type: "dashboard", label: "Continue Learning" },
    });

    assert.equal(view.passed, true);
    assert.equal(view.accuracy, 80);
    assert.equal(view.masteryLabel, "Developing");
    assert.equal(view.currentCompetencyScore, 72);
    assert.equal(view.nextAction.label, "Continue Learning");
  });

  it("throws when the attempt id is missing", () => {
    assert.throws(() => toOutcomeView({ score: 1 }), /could not be read/);
  });
});

describe("question type surface", () => {
  it("supports exactly the three canonical activity question types", () => {
    assert.deepEqual(
      [...SUPPORTED_QUESTION_TYPES].sort(),
      ["fill_blank", "multiple_choice", "number_input"],
    );
  });
});

describe("readiness on a catalogue row", () => {
  const ROW = {
    id: "a1",
    title: "Comparing fractions",
    path_status: "available",
    question_count: 5,
    is_ready: true,
  };

  it("carries the API's own readiness and question count onto the card", () => {
    const [activity] = buildActivityList([ROW]);

    assert.equal(activity.isReady, true);
    assert.equal(activity.questionCount, 5);
  });

  it("believes is_ready over the question count", () => {
    // A published activity can have questions and still be undeliverable, so
    // the field that means "a start would succeed" wins over the tally.
    const [activity] = buildActivityList([{ ...ROW, is_ready: false }]);

    assert.equal(activity.isReady, false);
  });

  it("reads a published activity with no questions as not ready", () => {
    const [activity] = buildActivityList([
      { ...ROW, is_ready: undefined, question_count: 0 },
    ]);

    assert.equal(activity.isReady, false);
  });

  it("treats a row from before the field existed as ready", () => {
    // Hiding every card behind a field an older payload never sent would be a
    // worse failure than the one being fixed.
    const [activity] = buildActivityList([
      { id: "a2", title: "Older payload", path_status: "available" },
    ]);

    assert.equal(activity.isReady, true);
    assert.equal(activity.questionCount, null);
  });

  it("carries readiness through to the player's own view", () => {
    const view = toQuestionView({ id: "a1", is_ready: false, question_count: 0, questions: [] });

    assert.equal(view.isReady, false);
    assert.equal(view.questionCount, 0);
  });
});

describe("activityGate", () => {
  const READY = { pathStatus: "available", isReady: true };

  it("lets a ready, unlocked activity through", () => {
    assert.equal(activityGate(READY), null);
  });

  it("closes an activity the API says could not be started", () => {
    const gate = activityGate({ ...READY, isReady: false });

    assert.equal(gate.kind, "not_ready");
    assert.equal(gate.label, "Not ready yet");
    assert.match(gate.hint, /teacher/i);
  });

  it("never offers a not-ready activity the words of a ready one", () => {
    assert.notEqual(activityGate({ ...READY, isReady: false }).label, "Ready to start");
  });

  it("closes a locked activity, and says so before it says anything else", () => {
    // Both reasons close the card, so the one a learner can act on is the one
    // they are given.
    const gate = activityGate({ pathStatus: "locked", isReady: false });

    assert.equal(gate.kind, "locked");
    assert.equal(gate.label, "Opens later");
  });
});

describe("startRefusal", () => {
  it("names an unfinished activity as unfinished rather than as a fault", () => {
    const refusal = startRefusal({ status: 409, code: "activity_not_ready" });

    assert.equal(refusal.kind, REFUSAL.NOT_READY);
    assert.equal(refusal.isFault, false);
    assert.match(refusal.title, /not ready/i);
  });

  it("names a locked activity as locked", () => {
    const refusal = startRefusal({ status: 412, code: "content_locked" });

    assert.equal(refusal.kind, REFUSAL.LOCKED);
    assert.equal(refusal.isFault, false);
  });

  it("names a missing activity as missing", () => {
    assert.equal(startRefusal({ status: 404 }).kind, REFUSAL.MISSING);
  });

  it("reads the code when a status is all that is odd", () => {
    // The code is the narrower statement, so it wins where the two disagree.
    assert.equal(startRefusal({ status: 500, code: "content_locked" }).kind, REFUSAL.LOCKED);
  });

  it("keeps the marking-pen red for something that genuinely broke", () => {
    const refusal = startRefusal({ status: 500, code: null });

    assert.equal(refusal.kind, REFUSAL.FAULT);
    assert.equal(refusal.isFault, true);
  });

  it("treats a failure it knows nothing about as a fault", () => {
    assert.equal(startRefusal({}).isFault, true);
    assert.equal(startRefusal().isFault, true);
  });
});
