import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  UNASSIGNED,
  dropRequests,
  dropSummary,
  droppedIn,
  emptySelection,
  enrolledIn,
  hasSelection,
  isLearnerSelected,
  isSectionSelected,
  rowLocked,
  sectionKey,
  selectionSize,
  toggleLearner,
  toggleSection,
  withLoadedFloor,
} from "../utils/drop-selection.js";

const MABINI = "sec-mabini";
const RIZAL = "sec-rizal";

const COUNTS = [
  { section_id: MABINI, enrolled: 72, dropped: 3 },
  { section_id: RIZAL, enrolled: 35, dropped: 0 },
  { section_id: null, enrolled: 2, dropped: 0 },
];

function learner(id, sectionId = MABINI) {
  return { user_id: id, section_id: sectionId };
}

const LOADED_MABINI = [learner("u1"), learner("u2"), learner("u3")];

describe("sectionKey", () => {
  it("folds a learner with no section into one group", () => {
    assert.equal(sectionKey(null), UNASSIGNED);
    assert.equal(sectionKey(undefined), UNASSIGNED);
    assert.equal(sectionKey(MABINI), MABINI);
  });
});

describe("enrolledIn", () => {
  it("reads the API's count for a section", () => {
    assert.equal(enrolledIn(COUNTS, MABINI), 72);
    assert.equal(droppedIn(COUNTS, MABINI), 3);
  });

  it("finds the unassigned group by its null id", () => {
    assert.equal(enrolledIn(COUNTS, null), 2);
  });

  it("answers zero for a section the counts do not mention", () => {
    assert.equal(enrolledIn(COUNTS, "sec-unknown"), 0);
    assert.equal(enrolledIn(undefined, MABINI), 0);
  });
});

describe("toggleSection", () => {
  it("selects and deselects a whole section", () => {
    const picked = toggleSection(emptySelection(), MABINI, LOADED_MABINI);
    assert.equal(isSectionSelected(picked, MABINI), true);

    const cleared = toggleSection(picked, MABINI, LOADED_MABINI);
    assert.equal(isSectionSelected(cleared, MABINI), false);
  });

  it("subsumes the individual picks it covers", () => {
    let selection = toggleLearner(emptySelection(), learner("u1"), LOADED_MABINI);
    assert.equal(selection.users.size, 1);

    selection = toggleSection(selection, MABINI, LOADED_MABINI);
    assert.equal(selection.users.size, 0);
    assert.equal(isSectionSelected(selection, MABINI), true);
  });

  it("does not mutate the selection it was given", () => {
    const before = emptySelection();
    toggleSection(before, MABINI, LOADED_MABINI);
    assert.equal(before.sections.size, 0);
  });
});

describe("toggleLearner", () => {
  it("selects one learner", () => {
    const selection = toggleLearner(emptySelection(), learner("u1"), LOADED_MABINI);
    assert.equal(isLearnerSelected(selection, learner("u1")), true);
    assert.equal(isLearnerSelected(selection, learner("u2")), false);
  });

  it("reports every learner of a selected section as selected", () => {
    const selection = toggleSection(emptySelection(), MABINI, LOADED_MABINI);
    assert.equal(isLearnerSelected(selection, learner("u2")), true);
  });

  it("unticking inside a selected section keeps the others by name", () => {
    let selection = toggleSection(emptySelection(), MABINI, LOADED_MABINI);
    selection = toggleLearner(selection, learner("u2"), LOADED_MABINI);

    assert.equal(isSectionSelected(selection, MABINI), false);
    assert.deepEqual([...selection.users].sort(), ["u1", "u3"]);
  });
});

describe("rowLocked", () => {
  it("locks a row only when its selected section is larger than the page", () => {
    const selection = toggleSection(emptySelection(), MABINI, LOADED_MABINI);

    assert.equal(rowLocked(selection, learner("u1"), { loaded: 3, enrolled: 72 }), true);
    assert.equal(rowLocked(selection, learner("u1"), { loaded: 72, enrolled: 72 }), false);
  });

  it("never locks a row whose section is not selected", () => {
    assert.equal(
      rowLocked(emptySelection(), learner("u1"), { loaded: 3, enrolled: 72 }),
      false,
    );
  });
});

describe("selectionSize", () => {
  it("counts a whole section from the API's total, not the loaded rows", () => {
    const selection = toggleSection(emptySelection(), MABINI, LOADED_MABINI);
    assert.equal(selectionSize(selection, COUNTS), 72);
  });

  it("adds individually picked learners to selected sections", () => {
    let selection = toggleSection(emptySelection(), MABINI, LOADED_MABINI);
    selection = toggleLearner(selection, learner("r1", RIZAL), [learner("r1", RIZAL)]);
    assert.equal(selectionSize(selection, COUNTS), 73);
  });

  it("counts nothing when nothing is selected", () => {
    assert.equal(selectionSize(emptySelection(), COUNTS), 0);
    assert.equal(hasSelection(emptySelection()), false);
  });
});

describe("dropRequests", () => {
  it("sends a section by id so the server resolves who is in it", () => {
    const selection = toggleSection(emptySelection(), MABINI, LOADED_MABINI);
    assert.deepEqual(dropRequests(selection), [{ section_id: MABINI }]);
  });

  it("sends named learners as one list", () => {
    let selection = toggleLearner(emptySelection(), learner("u1"), LOADED_MABINI);
    selection = toggleLearner(selection, learner("u2"), LOADED_MABINI);
    assert.deepEqual(dropRequests(selection), [{ user_ids: ["u1", "u2"] }]);
  });

  it("splits a mixed selection into a section call and a named call", () => {
    let selection = toggleSection(emptySelection(), MABINI, LOADED_MABINI);
    selection = toggleLearner(selection, learner("r1", RIZAL), [learner("r1", RIZAL)]);

    assert.deepEqual(dropRequests(selection), [
      { section_id: MABINI },
      { user_ids: ["r1"] },
    ]);
  });

  it("never sends the unassigned group as a section", () => {
    const selection = toggleSection(emptySelection(), null, []);
    assert.deepEqual(dropRequests(selection), []);
  });
});

describe("dropSummary", () => {
  const nameOf = (id) => (id === MABINI ? "Grade 6 - Mabini" : "Grade 6 - Rizal");

  it("names the section and its real size", () => {
    const selection = toggleSection(emptySelection(), MABINI, LOADED_MABINI);
    assert.equal(
      dropSummary(selection, COUNTS, nameOf),
      "Drop all 72 students from Grade 6 - Mabini?",
    );
  });

  it("counts the sections when there is more than one", () => {
    let selection = toggleSection(emptySelection(), MABINI, LOADED_MABINI);
    selection = toggleSection(selection, RIZAL, []);
    assert.equal(
      dropSummary(selection, COUNTS, nameOf),
      "Drop all 107 students from 2 sections?",
    );
  });

  it("falls back to a plain count for a mixed selection", () => {
    let selection = toggleLearner(emptySelection(), learner("u1"), LOADED_MABINI);
    assert.equal(dropSummary(selection, COUNTS, nameOf), "Drop 1 student?");
  });
});

describe("withLoadedFloor", () => {
  it("keeps the API's count when it is the larger one", () => {
    const floored = withLoadedFloor(COUNTS, [{ section_id: MABINI, loaded: 3 }]);
    assert.deepEqual(floored, [{ section_id: MABINI, enrolled: 72, dropped: 3 }]);
  });

  it("never says zero above a list of learners", () => {
    // The defect this guards: a roster reply with no per-section counts at all
    // rendered "0 enrolled" over three visible names.
    const floored = withLoadedFloor([], [{ section_id: MABINI, loaded: 3 }]);
    assert.equal(floored[0].enrolled, 3);
  });

  it("leaves a genuinely empty section at zero", () => {
    const floored = withLoadedFloor([], [{ section_id: MABINI, loaded: 0 }]);
    assert.equal(floored[0].enrolled, 0);
  });

  it("floors the unassigned group too", () => {
    const floored = withLoadedFloor([], [{ section_id: null, loaded: 2 }]);
    assert.equal(floored[0].enrolled, 2);
  });

  it("is what the selection then counts from", () => {
    const floored = withLoadedFloor([], [{ section_id: MABINI, loaded: 3 }]);
    const selection = toggleSection(emptySelection(), MABINI, LOADED_MABINI);
    assert.equal(selectionSize(selection, floored), 3);
  });

  it("answers with nothing when there are no groups", () => {
    assert.deepEqual(withLoadedFloor(COUNTS, []), []);
    assert.deepEqual(withLoadedFloor(COUNTS, undefined), []);
  });
});
