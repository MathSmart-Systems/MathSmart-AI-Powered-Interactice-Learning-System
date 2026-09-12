/**
 * Unit tests for the question authoring form.
 *
 * They run on Node's own test runner (`npm run test:unit`), which is why the
 * imports use an explicit `.js` extension: it is what lets this pure logic be
 * exercised without a bundler, a browser, or a dependency the project does not
 * already have.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { questionChanges, questionPayload, readQuestionForm, validateQuestion } from "../utils/question-form.js";

/**
 * A FormData stand-in carrying the names a real author dialog submits. Choices
 * arrive as repeated `choice` entries, matching `formData.getAll("choice")`.
 */
function formFrom(entries) {
  const data = new FormData();
  for (const [name, value] of entries) {
    if (name === "choice") {
      data.append(name, value);
    } else {
      data.set(name, value);
    }
  }
  return data;
}

function validFields(overrides = {}) {
  return {
    competency_id: "comp-1",
    question_type: "multiple_choice",
    difficulty: "medium",
    prompt: "What is 2 + 2?",
    choice: ["3", "4", "5"],
    answer_key: "4",
    explanation: "Two plus two makes four.",
    hint: "Count on from two.",
    visual_aid_description: "Two groups of two dots.",
    status: "draft",
    ...overrides,
  };
}

function multi(value, options = {}) {
  const entries = [["competency_id", value.competency_id]];

  if (value.id) entries.push(["id", value.id]);
  entries.push(["question_type", value.question_type]);
  entries.push(["difficulty", value.difficulty]);
  entries.push(["prompt", value.prompt]);
  for (const choice of value.choice ?? []) entries.push(["choice", choice]);
  entries.push(["answer_key", value.answer_key]);
  entries.push(["explanation", value.explanation ?? ""]);
  entries.push(["hint", value.hint ?? ""]);
  entries.push(["visual_aid_description", value.visual_aid_description ?? ""]);
  entries.push(["status", options.status ?? "draft"]);

  return formFrom(entries);
}

describe("readQuestionForm", () => {
  it("reads a complete multiple-choice submission", () => {
    const values = readQuestionForm(multi(validFields()));

    assert.equal(values.id, null);
    assert.equal(values.competency_id, "comp-1");
    assert.equal(values.question_type, "multiple_choice");
    assert.equal(values.difficulty, "medium");
    assert.equal(values.prompt, "What is 2 + 2?");
    assert.deepEqual(values.choices, ["3", "4", "5"]);
    assert.equal(values.answer_key, "4");
    assert.equal(values.explanation, "Two plus two makes four.");
    assert.equal(values.hint, "Count on from two.");
    assert.equal(values.visual_aid_description, "Two groups of two dots.");
    assert.equal(values.status, "draft");
  });

  it("carries the row id through the edit flow", () => {
    const values = readQuestionForm(multi(validFields({ id: "q-9" })));
    assert.equal(values.id, "q-9");
  });

  it("only collects choices for multiple choice", () => {
    const values = readQuestionForm(
      multi(validFields({ question_type: "number_input", choice: [], answer_key: "24" })),
    );
    assert.deepEqual(values.choices, []);
  });

  it("trims whitespace and ignores blank choice rows", () => {
    const values = readQuestionForm(
      multi(
        validFields({
          prompt: "  4 + 1 ?  ",
          choice: ["  five  ", "  ", "five"],
          answer_key: "five",
          explanation: "   ",
        }),
      ),
    );
    assert.equal(values.prompt, "4 + 1 ?");
    assert.deepEqual(values.choices, ["five", "five"]);
    assert.equal(values.explanation, "");
  });

  it("normalises the status to draft unless it is exactly published", () => {
    assert.equal(readQuestionForm(multi(validFields(), { status: "published" })).status, "published");
    assert.equal(readQuestionForm(multi(validFields(), { status: "archived" })).status, "draft");
    assert.equal(readQuestionForm(multi(validFields(), { status: "" })).status, "draft");
  });
});

describe("validateQuestion", () => {
  it("accepts a complete question", () => {
    assert.deepEqual(validateQuestion(readQuestionForm(multi(validFields()))), {});
  });

  it("requires the competency, type, difficulty and prompt", () => {
    const errors = validateQuestion(
      readQuestionForm(
        multi(
          validFields({
            competency_id: "",
            question_type: "",
            difficulty: "",
            prompt: "  ",
          }),
        ),
      ),
    );

    assert.ok(errors.competency_id, "missing competency should be flagged");
    assert.ok(errors.question_type, "missing type should be flagged");
    assert.ok(errors.difficulty, "missing difficulty should be flagged");
    assert.ok(errors.prompt, "missing prompt should be flagged");
  });

  it("refuses a reserved or unknown question type", () => {
    const errors = validateQuestion(
      readQuestionForm(multi(validFields({ question_type: "true_false", choice: ["Yes", "No"], answer_key: "Yes" }))),
    );
    assert.match(errors.question_type, /cannot be used/);
  });

  it("needs at least two distinct multiple-choice choices", () => {
    const oneChoice = validateQuestion(
      readQuestionForm(multi(validFields({ choice: ["solo"], answer_key: "solo" }))),
    );
    assert.ok(oneChoice.choices, "a single choice should be flagged");

    const duplicate = validateQuestion(
      readQuestionForm(multi(validFields({ choice: ["same", "same"], answer_key: "same" }))),
    );
    assert.ok(duplicate.choices, "duplicate choices should be flagged");
  });

  it("requires the multiple-choice key to be one of the choices", () => {
    const errors = validateQuestion(
      readQuestionForm(multi(validFields({ answer_key: "not listed" }))),
    );
    assert.ok(errors.answer_key, "an off-list key should be flagged");
  });

  it("requires a numeric answer for number input", () => {
    const blank = validateQuestion(
      readQuestionForm(multi(validFields({ question_type: "number_input", choice: [], answer_key: "" }))),
    );

    const text = validateQuestion(
      readQuestionForm(multi(validFields({ question_type: "number_input", choice: [], answer_key: "four" }))),
    );

    const numeric = validateQuestion(
      readQuestionForm(multi(validFields({ question_type: "number_input", choice: [], answer_key: " 24 " }))),
    );

    assert.ok(blank.answer_key, "an empty key should be flagged");
    assert.match(text.answer_key, /numeric/);
    assert.deepEqual(numeric, {});
  });

  it("requires a non-empty answer for fill in the blank", () => {
    const blank = validateQuestion(
      readQuestionForm(multi(validFields({ question_type: "fill_blank", choice: [], answer_key: "" }))),
    );
    assert.ok(blank.answer_key, "an empty key should be flagged");

    const filled = validateQuestion(
      readQuestionForm(multi(validFields({ question_type: "fill_blank", choice: [], answer_key: "12" }))),
    );
    assert.deepEqual(filled, {});
  });

  it("reports each invalid field without throwing", () => {
    const errors = validateQuestion(
      readQuestionForm(
        multi(validFields({ competency_id: "", question_type: "", difficulty: "", prompt: "" })),
      ),
    );
    assert.equal(Object.keys(errors).length, 4);
  });
});

describe("questionPayload", () => {
  it("maps the normalised form onto the API contract", () => {
    const payload = questionPayload(readQuestionForm(multi(validFields({ id: "q-1" }))));

    assert.deepEqual(payload, {
      competency_id: "comp-1",
      question_type: "multiple_choice",
      difficulty: "medium",
      prompt: "What is 2 + 2?",
      choices: ["3", "4", "5"],
      answer_key: "4",
      explanation: "Two plus two makes four.",
      hint: "Count on from two.",
      visual_aid_description: "Two groups of two dots.",
      status: "draft",
    });
  });

  it("sends empty optional fields as null", () => {
    const payload = questionPayload(
      readQuestionForm(multi(validFields({ explanation: "   ", hint: "", visual_aid_description: "" }))),
    );

    assert.equal(payload.explanation, null);
    assert.equal(payload.hint, null);
    assert.equal(payload.visual_aid_description, null);
  });
});

describe("questionChanges", () => {
  it("always rewrites the primary fields and the re-entered answer key", () => {
    const changes = questionChanges(
      readQuestionForm(multi(validFields({ id: "q-1", explanation: "", hint: "", visual_aid_description: "" }))),
    );

    assert.equal(changes.competency_id, "comp-1");
    assert.equal(changes.question_type, "multiple_choice");
    assert.equal(changes.difficulty, "medium");
    assert.equal(changes.prompt, "What is 2 + 2?");
    assert.equal(changes.answer_key, "4");
    assert.equal(changes.status, "draft");
  });

  it("omits blank write-only fields so the stored values survive an edit", () => {
    const changes = questionChanges(
      readQuestionForm(multi(validFields({ explanation: "", hint: "", visual_aid_description: "" }))),
    );

    assert.ok(!("explanation" in changes), "blank explanation must not overwrite the stored one");
    assert.ok(!("hint" in changes), "blank hint must not overwrite the stored one");
    assert.ok(
      !("visual_aid_description" in changes),
      "blank visual aid must not overwrite the stored one",
    );
  });

  it("rewrites the write-only fields the author typed again", () => {
    const changes = questionChanges(readQuestionForm(multi(validFields())));

    assert.equal(changes.explanation, "Two plus two makes four.");
    assert.equal(changes.hint, "Count on from two.");
    assert.equal(changes.visual_aid_description, "Two groups of two dots.");
  });

  it("sends choices only for multiple choice", () => {
    const mc = questionChanges(readQuestionForm(multi(validFields())));
    assert.deepEqual(mc.choices, ["3", "4", "5"]);

    const numeric = questionChanges(
      readQuestionForm(
        multi(validFields({ question_type: "number_input", choice: [], answer_key: "24" })),
      ),
    );
    assert.ok(!("choices" in numeric), "non-multiple-choice edits must not touch stored choices");
  });
});