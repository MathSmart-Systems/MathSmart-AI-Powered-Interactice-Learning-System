/**
 * Reading and validating the module author form.
 *
 * The same builders back both the create and the update server actions, so the
 * two flows cannot drift apart. Unlike a question, every module field is
 * readable, so the edit dialog opens with the stored content and an update
 * sends the same full payload a create does — there is no write-only field to
 * re-enter or protect from an unrelated edit.
 *
 * The content blocks (`rules`, `worked_examples`) are free-form JSONB arrays.
 * The authoring contract pins their shape to what the learner screens render:
 * a rule is `{ title, ruleFormula, explanation, visualExample }` and a worked
 * example is `{ problem, steps, solution, tip }`. Formulas, visual examples,
 * steps and tips are optional; titles, explanations, problems and solutions
 * carry the meaning.
 */

function readString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function trimList(formData, name) {
  return formData
    .getAll(name)
    .map((value) => readString(value).trim())
    .filter(Boolean);
}

/** The stored shape of a rule, mapped onto the four editor fields as strings. */
export function normalizeRule(raw) {
  const rule = raw ?? {};
  return {
    title: readString(rule.title),
    ruleFormula: readString(rule.ruleFormula),
    explanation: readString(rule.explanation),
    visualExample: readString(rule.visualExample),
  };
}

/** The stored shape of a worked example, mapped onto the editor fields. */
export function normalizeExample(raw) {
  const example = raw ?? {};
  return {
    problem: readString(example.problem),
    steps: Array.isArray(example.steps) ? example.steps.map(readString) : [],
    solution: readString(example.solution),
    tip: readString(example.tip),
  };
}

export function blankRule() {
  return { title: "", ruleFormula: "", explanation: "", visualExample: "" };
}

export function blankExample() {
  return { problem: "", steps: [], solution: "", tip: "" };
}

/**
 * The values the author dialog submits, normalised for validation and for the
 * API payload. Rules arrive as four repeated field names (`rule_title`,
 * `rule_formula`, `rule_explanation`, `rule_visual_example`); worked examples
 * carry their steps under `example_step_<index>` because each example has its
 * own step list.
 */
export function readModuleForm(formData) {
  const rules = [];
  const titles = formData.getAll("rule_title");
  const formulas = formData.getAll("rule_formula");
  const explanations = formData.getAll("rule_explanation");
  const visualExamples = formData.getAll("rule_visual_example");

  for (let index = 0; index < titles.length; index += 1) {
    rules.push({
      title: readString(titles[index]).trim(),
      ruleFormula: readString(formulas[index]).trim(),
      explanation: readString(explanations[index]).trim(),
      visualExample: readString(visualExamples[index]).trim(),
    });
  }

  const workedExamples = [];
  const problems = formData.getAll("example_problem");
  const solutions = formData.getAll("example_solution");
  const tips = formData.getAll("example_tip");

  for (let index = 0; index < problems.length; index += 1) {
    workedExamples.push({
      problem: readString(problems[index]).trim(),
      steps: trimList(formData, `example_step_${index}`),
      solution: readString(solutions[index]).trim(),
      tip: readString(tips[index]).trim(),
    });
  }

  return {
    id: formData.get("id") ? readString(formData.get("id")) : null,
    competency_id: readString(formData.get("competency_id")).trim(),
    title: readString(formData.get("title")).trim(),
    estimated_minutes: readString(formData.get("estimated_minutes")).trim(),
    order_index: readString(formData.get("order_index")).trim(),
    learning_objective: readString(formData.get("learning_objective")).trim(),
    short_explanation: readString(formData.get("short_explanation")).trim(),
    rules,
    worked_examples: workedExamples,
    status: readString(formData.get("status")).trim() === "published" ? "published" : "draft",
  };
}

/**
 * Field-level checks that mirror the API contract: a competency, a written
 * title, objective and explanation, bounded study time and a learning-path
 * order. Publishing also requires content that a learner can study — at least
 * one complete rule and one complete worked example — because a published
 * module sits directly on the learning path.
 */
export function validateModule(values) {
  const fieldErrors = {};

  if (!values.competency_id) {
    fieldErrors.competency_id = "Choose the competency this module teaches.";
  }

  if (values.title.length < 2) {
    fieldErrors.title = "Write a module title.";
  }

  const minutes = Number(values.estimated_minutes);
  if (!values.estimated_minutes || !Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
    fieldErrors.estimated_minutes =
      "Enter study time as whole minutes between 1 and 600.";
  }

  const order = Number(values.order_index);
  if (!/^\d+$/.test(values.order_index) || !Number.isInteger(order) || order < 0) {
    fieldErrors.order_index = "Enter the order of this module in the learning path.";
  }

  if (values.learning_objective.length < 2) {
    fieldErrors.learning_objective = "State the learning objective.";
  }

  if (values.short_explanation.length < 2) {
    fieldErrors.short_explanation = "Write a short explanation.";
  }

  if (values.status === "published") {
    if (values.rules.length === 0 || values.rules.every((rule) => !rule.title && !rule.explanation)) {
      fieldErrors.rules = "Publish at least one core rule with this module.";
    } else if (values.rules.some((rule) => !rule.title || !rule.explanation)) {
      fieldErrors.rules = "Every rule needs a title and an explanation.";
    }

    if (values.worked_examples.length === 0 || values.worked_examples.every((example) => !example.problem && !example.solution)) {
      fieldErrors.worked_examples = "Publish at least one worked example with this module.";
    } else if (values.worked_examples.some((example) => !example.problem || !example.solution)) {
      fieldErrors.worked_examples = "Every worked example needs a problem and a solution.";
    }
  }

  return fieldErrors;
}

/**
 * A rule as it is stored: only the fields that carry text, with blank rows
 * dropped entirely so a half-filled draft does not save empty noise.
 */
export function cleanRule(raw) {
  const rule = normalizeRule(raw);
  const title = rule.title.trim();
  const explanation = rule.explanation.trim();
  const ruleFormula = rule.ruleFormula.trim();
  const visualExample = rule.visualExample.trim();

  if (!title && !explanation && !ruleFormula && !visualExample) {
    return null;
  }

  const cleaned = { title, explanation };
  if (ruleFormula) {
    cleaned.ruleFormula = ruleFormula;
  }
  if (visualExample) {
    cleaned.visualExample = visualExample;
  }
  return cleaned;
}

/** A worked example as it is stored, blank rows and empty steps dropped. */
export function cleanExample(raw) {
  const example = normalizeExample(raw);
  const problem = example.problem.trim();
  const solution = example.solution.trim();
  const tip = example.tip.trim();
  const steps = example.steps.map((step) => readString(step).trim()).filter(Boolean);

  if (!problem && !solution && !tip && steps.length === 0) {
    return null;
  }

  const cleaned = { problem, solution };
  if (steps.length > 0) {
    cleaned.steps = steps;
  }
  if (tip) {
    cleaned.tip = tip;
  }
  return cleaned;
}

/**
 * The body shared by POST (create) and PATCH (update). Every module field is
 * readable and fully rewritten on an edit, so one payload builder serves both
 * flows — there is no field an unrelated edit could accidentally wipe.
 */
export function modulePayload(values) {
  return {
    competency_id: values.competency_id,
    title: values.title,
    estimated_minutes: Number(values.estimated_minutes),
    order_index: Number(values.order_index),
    learning_objective: values.learning_objective,
    short_explanation: values.short_explanation,
    rules: values.rules.map(cleanRule).filter(Boolean),
    worked_examples: values.worked_examples.map(cleanExample).filter(Boolean),
    status: values.status,
  };
}