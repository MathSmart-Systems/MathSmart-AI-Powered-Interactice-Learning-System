/**
 * Unit tests for the module authoring form.
 *
 * They run on Node's own test runner (`npm run test:unit`), which is why the
 * imports use an explicit `.js` extension: it is what lets this pure logic be
 * exercised without a bundler, a browser, or a dependency the project does not
 * already have.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cleanExample,
  cleanRule,
  modulePayload,
  readModuleForm,
  validateModule,
} from "../utils/module-form.js";

/**
 * A FormData stand-in carrying the names a real author dialog submits. Rules
 * arrive as four repeated field names; worked-example steps carry the example
 * index (`example_step_<index>`) because each example keeps its own step list.
 */
function formFrom(entries) {
  const data = new FormData();
  for (const [name, value] of entries) {
    if (Array.isArray(value)) {
      for (const item of value) {
        data.append(name, item);
      }
    } else {
      data.append(name, value);
    }
  }
  return data;
}

function validModule(overrides = {}) {
  return {
    id: null,
    competency_id: "comp-1",
    title: "Multiplying Rational Numbers",
    estimated_minutes: "15",
    order_index: "2",
    learning_objective: "Multiply signed rational numbers fluently.",
    short_explanation: "Step-by-step sign rules for multiplication.",
    rule_title: ["Negative times negative", "Positive times positive"],
    rule_formula: ["(-a) x (-b) = +(ab)", "a x b = ab"],
    rule_explanation: ["Two negatives point back positive.", "Same signs stay positive."],
    rule_visual_example: ["(-3) x (-4) = 12", "3 x 4 = 12"],
    example_problem: ["Calculate (-3) x (-4).", "Calculate 2 x 3."],
    example_step_0: ["Rewrite the signs.", "Multiply 3 and 4.", "Two negatives make a positive."],
    example_step_1: ["Multiply 2 and 3."],
    example_solution: ["12", "6"],
    example_tip: ["Count the negatives.", ""],
    status: "draft",
    ...overrides,
  };
}

function moduleFrom(module, options = {}) {
  const entries = [];

  if (module.id) entries.push(["id", module.id]);
  entries.push(["competency_id", module.competency_id]);
  entries.push(["title", module.title]);
  entries.push(["estimated_minutes", module.estimated_minutes]);
  entries.push(["order_index", module.order_index]);
  entries.push(["learning_objective", module.learning_objective]);
  entries.push(["short_explanation", module.short_explanation]);

  module.rule_title.forEach((title, index) => {
    entries.push(["rule_title", title]);
    entries.push(["rule_formula", module.rule_formula[index] ?? ""]);
    entries.push(["rule_explanation", module.rule_explanation[index] ?? ""]);
    entries.push(["rule_visual_example", module.rule_visual_example[index] ?? ""]);
  });

  module.example_problem.forEach((problem, index) => {
    entries.push(["example_problem", problem]);
    for (const step of module[`example_step_${index}`] ?? []) {
      entries.push([`example_step_${index}`, step]);
    }
    entries.push(["example_solution", module.example_solution[index] ?? ""]);
    entries.push(["example_tip", module.example_tip[index] ?? ""]);
  });

  entries.push(["status", options.status ?? module.status ?? "draft"]);
  return formFrom(entries);
}

describe("readModuleForm", () => {
  it("reads a complete module submission", () => {
    const values = readModuleForm(moduleFrom(validModule()));

    assert.equal(values.id, null);
    assert.equal(values.competency_id, "comp-1");
    assert.equal(values.title, "Multiplying Rational Numbers");
    assert.equal(values.estimated_minutes, "15");
    assert.equal(values.order_index, "2");
    assert.equal(values.learning_objective, "Multiply signed rational numbers fluently.");
    assert.equal(values.short_explanation, "Step-by-step sign rules for multiplication.");
    assert.equal(values.status, "draft");
    assert.deepEqual(values.rules, [
      {
        title: "Negative times negative",
        ruleFormula: "(-a) x (-b) = +(ab)",
        explanation: "Two negatives point back positive.",
        visualExample: "(-3) x (-4) = 12",
      },
      {
        title: "Positive times positive",
        ruleFormula: "a x b = ab",
        explanation: "Same signs stay positive.",
        visualExample: "3 x 4 = 12",
      },
    ]);
    assert.deepEqual(values.worked_examples, [
      {
        problem: "Calculate (-3) x (-4).",
        steps: ["Rewrite the signs.", "Multiply 3 and 4.", "Two negatives make a positive."],
        solution: "12",
        tip: "Count the negatives.",
      },
      {
        problem: "Calculate 2 x 3.",
        steps: ["Multiply 2 and 3."],
        solution: "6",
        tip: "",
      },
    ]);
  });

  it("carries the module id through the edit flow", () => {
    const values = readModuleForm(moduleFrom(validModule({ id: "mod-9" })));
    assert.equal(values.id, "mod-9");
  });

  it("trims whitespace and drops blank step rows", () => {
    const values = readModuleForm(
      moduleFrom(
        validModule({
          title: "  Sign Rules  ",
          rule_explanation: ["  Two negatives make a positive  ", "   "],
          example_step_1: ["Multiply 2 and 3.", "  ", "  6 "],
        }),
      ),
    );

    assert.equal(values.title, "Sign Rules");
    assert.equal(values.rules[0].explanation, "Two negatives make a positive");
    assert.deepEqual(values.worked_examples[0].steps, [
      "Rewrite the signs.",
      "Multiply 3 and 4.",
      "Two negatives make a positive.",
    ]);
    assert.deepEqual(values.worked_examples[1].steps, ["Multiply 2 and 3.", "6"]);
  });

  it("normalises the status to draft unless it is exactly published", () => {
    assert.equal(
      readModuleForm(moduleFrom(validModule(), { status: "published" })).status,
      "published",
    );
    assert.equal(readModuleForm(moduleFrom(validModule(), { status: "archived" })).status, "draft");
    assert.equal(readModuleForm(moduleFrom(validModule(), { status: "" })).status, "draft");
  });
});

describe("validateModule", () => {
  it("accepts a complete draft with no rules or examples", () => {
    const rules = [];
    const errors = validateModule(
      readModuleForm(
        moduleFrom(
          validModule({
            rule_title: [],
            rule_formula: [],
            rule_explanation: [],
            rule_visual_example: [],
            example_problem: [],
            example_solution: [],
            example_tip: [],
          }),
        ),
      ),
    );

    assert.equal(rules.length, 0);
    assert.deepEqual(errors, {});
  });

  it("accepts a complete published module", () => {
    const errors = validateModule(
      readModuleForm(moduleFrom(validModule(), { status: "published" })),
    );
    assert.deepEqual(errors, {});
  });

  it("requires the competency, title, minutes, order, objective and explanation", () => {
    const errors = validateModule(
      readModuleForm(
        moduleFrom(
          validModule({
            competency_id: "",
            title: "  ",
            estimated_minutes: "",
            order_index: "",
            learning_objective: "  ",
            short_explanation: "",
          }),
        ),
      ),
    );

    assert.ok(errors.competency_id, "missing competency should be flagged");
    assert.ok(errors.title, "missing title should be flagged");
    assert.ok(errors.estimated_minutes, "missing study time should be flagged");
    assert.ok(errors.order_index, "missing order should be flagged");
    assert.ok(errors.learning_objective, "missing objective should be flagged");
    assert.ok(errors.short_explanation, "missing explanation should be flagged");
    assert.equal(Object.keys(errors).length, 6);
  });

  it("bounds study time and order", () => {
    const tooLong = validateModule(
      readModuleForm(moduleFrom(validModule({ estimated_minutes: "601" }))),
    );
    assert.ok(tooLong.estimated_minutes, "study time above 600 should be flagged");

    const negative = validateModule(
      readModuleForm(moduleFrom(validModule({ order_index: "-1" }))),
    );
    assert.ok(negative.order_index, "a negative order should be flagged");

    const fractional = validateModule(
      readModuleForm(moduleFrom(validModule({ estimated_minutes: "1.5" }))),
    );
    assert.ok(fractional.estimated_minutes, "fractional study time should be flagged");
  });

  it("refuses to publish without content", () => {
    const noRules = validateModule(
      readModuleForm(
        moduleFrom(
          validModule({
            rule_title: [],
            rule_formula: [],
            rule_explanation: [],
            rule_visual_example: [],
            example_problem: [],
            example_solution: [],
            example_tip: [],
          }),
          { status: "published" },
        ),
      ),
    );

    assert.ok(noRules.rules, "a published module with no rules should be flagged");
    assert.ok(
      noRules.worked_examples,
      "a published module with no worked examples should be flagged",
    );
  });

  it("refuses to publish incomplete rules or examples", () => {
    const incompleteRules = validateModule(
      readModuleForm(
        moduleFrom(
          validModule({ rule_explanation: ["Two negatives make a positive", ""] }),
          { status: "published" },
        ),
      ),
    );
    assert.match(incompleteRules.rules, /every rule needs/i);

    const incompleteExamples = validateModule(
      readModuleForm(
        moduleFrom(
          validModule({ example_solution: ["", "6"] }),
          { status: "published" },
        ),
      ),
    );
    assert.match(incompleteExamples.worked_examples, /every worked example needs/i);
  });
});

describe("modulePayload", () => {
  it("maps the normalised form onto the API contract", () => {
    const payload = modulePayload(
      readModuleForm(moduleFrom(validModule({ id: "mod-1" }), { status: "published" })),
    );

    assert.deepEqual(payload, {
      competency_id: "comp-1",
      title: "Multiplying Rational Numbers",
      estimated_minutes: 15,
      order_index: 2,
      learning_objective: "Multiply signed rational numbers fluently.",
      short_explanation: "Step-by-step sign rules for multiplication.",
      rules: [
        {
          title: "Negative times negative",
          ruleFormula: "(-a) x (-b) = +(ab)",
          explanation: "Two negatives point back positive.",
          visualExample: "(-3) x (-4) = 12",
        },
        {
          title: "Positive times positive",
          ruleFormula: "a x b = ab",
          explanation: "Same signs stay positive.",
          visualExample: "3 x 4 = 12",
        },
      ],
      worked_examples: [
        {
          problem: "Calculate (-3) x (-4).",
          steps: ["Rewrite the signs.", "Multiply 3 and 4.", "Two negatives make a positive."],
          solution: "12",
          tip: "Count the negatives.",
        },
        {
          problem: "Calculate 2 x 3.",
          steps: ["Multiply 2 and 3."],
          solution: "6",
        },
      ],
      status: "published",
    });
  });

  it("drops blank steps and empty optional fields", () => {
    const payload = modulePayload(
      readModuleForm(
        moduleFrom(
          validModule({
            rule_formula: ["", ""],
            rule_visual_example: ["", ""],
            example_tip: ["", ""],
            example_step_1: [],
          }),
        ),
      ),
    );

    assert.ok(!("ruleFormula" in payload.rules[0]), "blank formula should be omitted");
    assert.ok(!("visualExample" in payload.rules[0]), "blank visual example should be omitted");
    assert.ok(!("tip" in payload.worked_examples[1]), "blank tip should be omitted");
    assert.ok(!("steps" in payload.worked_examples[1]), "blank steps should be omitted");
  });

  it("drops fully blank rules and examples", () => {
    const payload = modulePayload(
      readModuleForm(
        moduleFrom(
          validModule({
            rule_title: ["Negative times negative", " ", "  "],
            rule_formula: ["(-a) x (-b) = +(ab)", "", ""],
            rule_explanation: ["Two negatives point back positive.", "", ""],
            rule_visual_example: ["(-3) x (-4) = 12", "", ""],
            example_problem: ["Calculate (-3) x (-4).", ""],
            example_step_1: [],
            example_solution: ["12", ""],
            example_tip: ["Count the negatives.", ""],
          }),
        ),
      ),
    );

    assert.equal(payload.rules.length, 1, "blank rule rows should be dropped");
    assert.equal(payload.worked_examples.length, 1, "blank example rows should be dropped");
  });
});

describe("cleanRule and cleanExample", () => {
  it("normalises stored content onto the editor shape", () => {
    assert.deepEqual(cleanRule({ title: " A rule ", explanation: " Why " }), {
      title: "A rule",
      explanation: "Why",
    });
    assert.deepEqual(
      cleanExample({ problem: " 2 + 2 ", steps: ["Count", " "], solution: " 4 ", tip: " Take care " }),
      { problem: "2 + 2", steps: ["Count"], solution: "4", tip: "Take care" },
    );
  });

  it("returns null for blank content", () => {
    assert.equal(cleanRule({ title: "", ruleFormula: "", explanation: "  ", visualExample: "" }), null);
    assert.equal(cleanExample({ problem: "  ", steps: [], solution: "", tip: "" }), null);
  });
});