/**
 * The content, learner and evidence a demo day needs, and how to take them away
 * again.
 *
 * Everything here is created through the same authenticated routes the
 * workspace uses, never by writing rows directly. That is the point rather
 * than a constraint: an activity published without questions, or a paper whose
 * competency is still a draft, is refused by the API — so a seed that goes
 * through it cannot produce the broken content this demo is meant to show
 * working. If a call here is refused, the seed stops and says so.
 *
 * Nothing in this file is a migration. It writes demo records, marks every one
 * of them, and removes only what it marked.
 */

import { randomUUID } from "node:crypto";

/** Stamped on every demo record so removal can find them and nothing else. */
export const DEMO_MARK = "DEMO";

/** The sentence that appears on every demo record a teacher can read. */
export const DEMO_NOTE = "Created by npm run seed:demo. Safe to remove.";

/**
 * The learner a demonstrator signs in as.
 *
 * `example.com` because it is reserved for exactly this and resolves, which a
 * `.local` or `.test` address does not: the enrolment route validates the
 * address and refuses a special-use name outright.
 */
export const DEMO_LEARNER = Object.freeze({
  email: "demo.learner@example.com",
  fullName: "Ana Dela Cruz",
  learnerId: "DEMO-LRN-0001",
});

/** Hosts that mean "this machine". */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

/**
 * Whether one configured address points at this machine.
 *
 * Fails closed: an address that is missing, or one this cannot parse, is not
 * local. The only safe answer to "where would this write?" when the answer is
 * unknown is "somewhere it must not".
 */
export function isLoopbackUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    return LOCAL_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** The name of the one variable that permits a hosted target. */
export const HOSTED_OPT_IN = "DEMO_ALLOW_HOSTED";

/** How a hosted address reads in a warning, without inventing certainty. */
function describeTarget(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "an address this could not read";
  }
}

/**
 * Refuses to run anywhere but the local stack, unless told otherwise.
 *
 * Seeding a hosted project puts invented children into a real school's
 * records, so the default is to refuse. The check names the offending target
 * rather than failing vaguely, and it runs before a single request is made.
 *
 * `DEMO_ALLOW_HOSTED=1` lifts the refusal. It is deliberately a separate
 * variable rather than a flag on the command, so it cannot be reached by
 * habit or by a stale shell history entry, and the script says loudly where
 * it is about to write before it writes anything. Everything it creates
 * still carries the demo mark, and `npm run seed:demo:remove` still takes
 * away only what carries it.
 */
export function assertLocalTargets(env, { say } = {}) {
  const targets = [
    ["Supabase", env.NEXT_PUBLIC_SUPABASE_URL],
    ["API", env.NEXT_PUBLIC_API_BASE_URL],
  ];

  const remote = targets.filter(([, value]) => !isLoopbackUrl(value));
  if (remote.length === 0) return;

  const names = remote
    .map(([name, value]) => (value ? `${name} is not a local address` : `${name} is not configured`))
    .join("; ");

  if (env[HOSTED_OPT_IN] !== "1") {
    throw new Error(
      `Refusing to seed: ${names}. This script writes learners and attempts, and will only ` +
        "do that against the Supabase stack on this machine (npm run db:start). " +
        `If a hosted target is genuinely what you want, set ${HOSTED_OPT_IN}=1 and run it again.`,
    );
  }

  // A missing address is never permitted, whatever the opt-in says: "write
  // nowhere in particular" is not a target anybody chose.
  const unset = remote.filter(([, value]) => !value);
  if (unset.length > 0) {
    throw new Error(
      `Refusing to seed: ${unset.map(([name]) => name).join(" and ")} is not configured. ` +
        `${HOSTED_OPT_IN} permits a hosted target, not an unknown one.`,
    );
  }

  const report = say ?? ((message) => process.stdout.write(`${message}
`));
  report("");
  report(`!! ${HOSTED_OPT_IN}=1 — writing to a target that is NOT this machine:`);
  for (const [name, value] of remote) report(`     ${name}: ${describeTarget(value)}`);
  report("   Everything created carries the demo mark and is removable with");
  report("   npm run seed:demo:remove.");
  report("");
}

/** One authenticated call against the MathSmart API. */
async function callApi(env, token, path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${env.NEXT_PUBLIC_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new Error(
      `${method} ${path} was refused (${response.status}${error.code ? ` ${error.code}` : ""}): ` +
        `${error.message ?? "no message"}`,
    );
  }

  return payload;
}

/**
 * Signs in and returns an access token.
 *
 * The credentials come from the environment and are never written anywhere:
 * not to a log line, not into an error message, not into the returned value.
 */
async function signIn(env, email, password) {
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(
      `Could not sign in as ${email} (${response.status}). Check the account exists on the ` +
        "local stack and that its credentials are in the environment.",
    );
  }

  return (await response.json()).access_token;
}

/** One call against the local Auth admin API. */
async function callAuthAdmin(env, path, { method = "GET", body } = {}) {
  const key = env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set, so the demo learner's password cannot be set. " +
        "It is printed by `npx supabase status` for the local stack.",
    );
  }

  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    // Deliberately no body: an Auth admin error can echo the request.
    throw new Error(`The local Auth admin API refused ${method} ${path} (${response.status}).`);
  }

  return response.json();
}

/** The Grade 6 the MVP teaches. */
async function gradeId(env, token) {
  const { data } = await callApi(env, token, "/teacher-admin/grades?page_size=50");
  const grade = (data ?? []).find((row) => Number(row.level) === 6);
  if (!grade) {
    throw new Error("No Grade 6 level exists on this stack. Run `npm run db:reset` first.");
  }
  return grade.grade_id ?? grade.id;
}

/**
 * The three competencies the demo teaches, weakest first once the diagnostic
 * has run. Ordinary Grade 6 material rather than lorem ipsum, because a
 * demonstration of a mathematics product should look like mathematics.
 */
const COMPETENCIES = [
  {
    key: "fractions",
    code: `${DEMO_MARK}-M6NS-01`,
    name: "Adding and subtracting similar fractions",
    domain: "Numbers and Number Sense",
  },
  {
    key: "decimals",
    code: `${DEMO_MARK}-M6NS-02`,
    name: "Dividing decimals by whole numbers",
    domain: "Numbers and Number Sense",
  },
  {
    key: "ratio",
    code: `${DEMO_MARK}-M6NS-03`,
    name: "Expressing ratios in simplest form",
    domain: "Numbers and Number Sense",
  },
  {
    key: "percent",
    code: `${DEMO_MARK}-M6NS-04`,
    name: "Finding a percentage of a number",
    domain: "Numbers and Number Sense",
  },
];

/** A module per competency, written as a teacher would write one. */
const MODULES = {
  fractions: {
    title: `${DEMO_MARK} · Adding fractions with the same bottom number`,
    estimated_minutes: 15,
    learning_objective:
      "Add and subtract fractions that share a denominator, and say the answer in its simplest form.",
    short_explanation:
      "When two fractions are cut into the same number of equal parts, you already have parts of " +
      "the same size. Counting them is all that is left to do, so only the top numbers change.",
    rules: [
      {
        title: "Keep the bottom number, add the top numbers",
        explanation:
          "The denominator names the size of each part. Adding quarters to quarters still gives " +
          "quarters, so it stays as it is while the numerators are added.",
        formula: "a/c + b/c = (a + b)/c",
        visual_example:
          "Two identical bars, each divided into four equal parts. One bar has a single part " +
          "shaded and the other has two, and sliding them together shades three parts of one bar.",
      },
      {
        title: "Simplify when the answer allows it",
        explanation:
          "If the top and bottom numbers share a factor, divide both by it. Two quarters and two " +
          "quarters make four quarters, which is one whole.",
        formula: "2/6 = 1/3",
        visual_example:
          "A bar in six parts with two shaded, beside a bar in three parts with one shaded; the " +
          "shaded lengths match exactly.",
      },
    ],
    worked_examples: [
      {
        problem: "1/4 + 2/4",
        steps: [
          "The bottom numbers are already the same, so nothing needs changing.",
          "Add the top numbers: 1 + 2 = 3.",
          "Write the answer over the same bottom number.",
        ],
        solution: "3/4",
        tip: "Only the top numbers move. The bottom number is telling you the size of the pieces.",
      },
      {
        problem: "5/8 - 3/8",
        steps: ["The bottom numbers match.", "Subtract the top numbers: 5 - 3 = 2.", "2/8 simplifies to 1/4."],
        solution: "1/4",
        tip: "Always check whether the answer can be written in smaller numbers.",
      },
    ],
  },
  decimals: {
    title: `${DEMO_MARK} · Dividing a decimal by a whole number`,
    estimated_minutes: 20,
    learning_objective:
      "Divide a decimal number by a whole number and place the decimal point correctly.",
    short_explanation:
      "Long division works exactly as it does for whole numbers. The only new thing to remember " +
      "is that the decimal point in the answer sits directly above the one you started with.",
    rules: [
      {
        title: "Bring the decimal point straight up",
        explanation:
          "Write the point in the answer above the point in the number being divided, before you " +
          "start dividing. Then the division itself is the familiar one.",
        formula: "7.2 ÷ 4 → point above the point",
        visual_example:
          "A long-division frame with a dotted vertical line joining the decimal point inside to " +
          "the decimal point on the answer line above it.",
      },
    ],
    worked_examples: [
      {
        problem: "7.2 ÷ 4",
        steps: [
          "Place the decimal point in the answer above the one in 7.2.",
          "4 goes into 7 once, with 3 left over.",
          "Bring down the 2 to make 32. 4 goes into 32 eight times.",
        ],
        solution: "1.8",
        tip: "If the first digit is smaller than the divisor, write a zero and carry on.",
      },
    ],
  },
  percent: {
    title: `${DEMO_MARK} · Finding a percentage of a number`,
    estimated_minutes: 20,
    learning_objective: "Find a percentage of a whole number using a fraction or a decimal.",
    short_explanation:
      "Per cent means 'out of every hundred'. Once you can write the percentage as a fraction " +
      "over a hundred, finding it is only multiplication.",
    rules: [
      {
        title: "Write the percentage over a hundred, then multiply",
        explanation:
          "25% is 25 out of every 100, which is the fraction 25/100. Multiplying the amount by " +
          "that fraction gives the part you are looking for.",
        formula: "p% of n = (p / 100) × n",
        visual_example:
          "A hundred-square with twenty-five cells shaded, beside a bar of forty counters with " +
          "ten of them circled.",
      },
    ],
    worked_examples: [
      {
        problem: "Find 25% of 40",
        steps: ["25% is 25/100, which simplifies to 1/4.", "A quarter of 40 is 10."],
        solution: "10",
        tip: "Learn the easy ones by heart: 50% is a half, 25% is a quarter, 10% is a tenth.",
      },
    ],
  },
  ratio: {
    title: `${DEMO_MARK} · Writing a ratio in its simplest form`,
    estimated_minutes: 15,
    learning_objective: "Simplify a ratio by dividing both parts by their greatest common factor.",
    short_explanation:
      "A ratio compares two amounts. Dividing both sides by the same number keeps the comparison " +
      "true while making the numbers easier to hold in your head.",
    rules: [
      {
        title: "Divide both parts by the same number",
        explanation:
          "Find the largest number that divides both parts exactly, then divide each by it. The " +
          "comparison has not changed, only the way it is written.",
        formula: "12 : 18 = 2 : 3",
        visual_example:
          "Twelve counters beside eighteen counters, regrouped into six equal piles on each side: " +
          "two piles against three.",
      },
    ],
    worked_examples: [
      {
        problem: "Simplify 12 : 18",
        steps: ["The largest number dividing both is 6.", "12 ÷ 6 = 2 and 18 ÷ 6 = 3."],
        solution: "2 : 3",
        tip: "If you cannot see the largest factor at once, halve both sides repeatedly.",
      },
    ],
  },
};

/**
 * Four questions per competency: two for its practice and two for the papers.
 *
 * Every one carries an answer key, a hint and an explanation, because a
 * demonstration that cannot show a hint or an explanation is not showing the
 * product.
 */
const QUESTIONS = {
  fractions: [
    {
      prompt: "What is 1/4 + 2/4?",
      choices: ["3/4", "3/8", "1/2", "2/4"],
      answer: "3/4",
      hint: "The bottom numbers already match, so only the top numbers change.",
      explanation: "Add the numerators and keep the denominator: 1 + 2 = 3, so the answer is 3/4.",
    },
    {
      prompt: "What is 5/8 - 3/8 in its simplest form?",
      choices: ["1/4", "2/8", "2/16", "8/8"],
      answer: "1/4",
      hint: "Subtract the top numbers first, then see whether the answer can be made smaller.",
      explanation: "5 - 3 = 2, giving 2/8. Dividing both numbers by 2 gives 1/4.",
    },
    {
      prompt: "Maria ate 2/6 of a pizza and her brother ate 1/6. How much did they eat together?",
      choices: ["3/6", "3/12", "2/12", "1/2"],
      answer: "3/6",
      hint: "Both amounts are sixths, so you can count them straight away.",
      explanation: "2 sixths and 1 sixth make 3 sixths, written 3/6 — which also simplifies to 1/2.",
    },
    {
      prompt: "Which of these is already in its simplest form?",
      choices: ["3/5", "2/4", "6/8", "4/6"],
      answer: "3/5",
      hint: "Look for a number that divides both the top and the bottom exactly.",
      explanation: "3 and 5 share no factor but 1, so 3/5 cannot be written in smaller numbers.",
    },
  ],
  decimals: [
    {
      prompt: "What is 7.2 ÷ 4?",
      choices: ["1.8", "18", "0.18", "2.8"],
      answer: "1.8",
      hint: "Put the decimal point in the answer directly above the one in 7.2.",
      explanation: "4 goes into 7 once with 3 left; 32 ÷ 4 = 8. The point sits above, giving 1.8.",
    },
    {
      prompt: "What is 9.6 ÷ 3?",
      choices: ["3.2", "32", "0.32", "3.6"],
      answer: "3.2",
      hint: "Divide as you would for whole numbers, then place the point.",
      explanation: "9 ÷ 3 = 3 and 6 ÷ 3 = 2, so the answer is 3.2.",
    },
    {
      prompt: "A ribbon 8.4 m long is cut into 4 equal pieces. How long is each piece?",
      choices: ["2.1 m", "21 m", "0.21 m", "2.4 m"],
      answer: "2.1 m",
      hint: "Divide the length by the number of pieces.",
      explanation: "8.4 ÷ 4 = 2.1, so each piece is 2.1 metres long.",
    },
    {
      prompt: "Where does the decimal point go in the answer to 5.5 ÷ 5?",
      choices: [
        "Directly above the point in 5.5",
        "At the end of the answer",
        "One place to the right",
        "It is left out",
      ],
      answer: "Directly above the point in 5.5",
      hint: "Place the point before you start dividing.",
      explanation: "The point in the answer always sits above the point in the number being divided.",
    },
  ],
  percent: [
    {
      prompt: "What is 25% of 40?",
      choices: ["10", "15", "4", "25"],
      answer: "10",
      hint: "25% is the same as one quarter.",
      explanation: "25% is 25/100, which simplifies to 1/4, and a quarter of 40 is 10.",
    },
    {
      prompt: "What is 10% of 250?",
      choices: ["25", "2.5", "50", "10"],
      answer: "25",
      hint: "Finding 10% is the same as dividing by 10.",
      explanation: "10% of 250 is 250 ÷ 10, which is 25.",
    },
    {
      prompt: "A shirt costs 500 pesos. A 20% discount takes off how much?",
      choices: ["100 pesos", "20 pesos", "80 pesos", "120 pesos"],
      answer: "100 pesos",
      hint: "Find one tenth first, then double it.",
      explanation: "10% of 500 is 50, so 20% is 100 pesos.",
    },
    {
      prompt: "Which of these is the same as 50%?",
      choices: ["1/2", "1/5", "5/100", "1/50"],
      answer: "1/2",
      hint: "Per cent means out of a hundred.",
      explanation: "50% is 50/100, and dividing both numbers by 50 gives 1/2.",
    },
  ],
  ratio: [
    {
      prompt: "Write 12 : 18 in its simplest form.",
      choices: ["2 : 3", "6 : 9", "4 : 6", "1 : 2"],
      answer: "2 : 3",
      hint: "Find the largest number that divides both 12 and 18.",
      explanation: "Both divide by 6, giving 2 : 3.",
    },
    {
      prompt: "A class has 10 boys and 15 girls. What is the ratio of boys to girls, simplified?",
      choices: ["2 : 3", "10 : 15", "3 : 2", "1 : 2"],
      answer: "2 : 3",
      hint: "Divide both numbers by the same amount.",
      explanation: "10 and 15 both divide by 5, giving 2 : 3.",
    },
    {
      prompt: "Which ratio is equivalent to 3 : 4?",
      choices: ["9 : 12", "4 : 3", "6 : 9", "3 : 8"],
      answer: "9 : 12",
      hint: "Multiply both parts by the same number.",
      explanation: "Multiplying both parts of 3 : 4 by 3 gives 9 : 12, which compares the same amounts.",
    },
    {
      prompt: "Simplify 20 : 25.",
      choices: ["4 : 5", "5 : 4", "2 : 5", "10 : 15"],
      answer: "4 : 5",
      hint: "Both numbers are in the five times table.",
      explanation: "Dividing both by 5 gives 4 : 5.",
    },
  ],
};

/**
 * Creates a competency and publishes it.
 *
 * No grade is sent: MathSmart teaches one, the server resolves it, and
 * `CompetencyDraft` refuses a request that tries to choose one.
 */
async function createCompetency(env, token, spec) {
  const created = await callApi(env, token, "/teacher-admin/competencies", {
    method: "POST",
    body: {
      code: spec.code,
      name: `${DEMO_MARK} · ${spec.name}`,
      domain: spec.domain,
      description: DEMO_NOTE,
      status: "draft",
    },
  });

  const id = created.data.competency_id;
  await callApi(env, token, `/teacher-admin/competencies/${id}`, {
    method: "PATCH",
    body: { status: "published" },
  });
  return id;
}

/** Creates a published question under a competency. */
async function createQuestion(env, token, competencyId, spec) {
  const choices = spec.choices.map((label, index) => ({
    key: String.fromCharCode(97 + index),
    label,
  }));
  const answer = choices.find((choice) => choice.label === spec.answer);

  const created = await callApi(env, token, "/teacher-admin/questions", {
    method: "POST",
    body: {
      competency_id: competencyId,
      question_type: "multiple_choice",
      difficulty: "easy",
      prompt: spec.prompt,
      choices,
      answer_key: answer.key,
      explanation: spec.explanation,
      hint: spec.hint,
      status: "published",
    },
  });
  return created.data.question_id;
}

export {
  COMPETENCIES,
  MODULES,
  QUESTIONS,
  callApi,
  callAuthAdmin,
  createCompetency,
  createQuestion,
  gradeId,
  signIn,
};
