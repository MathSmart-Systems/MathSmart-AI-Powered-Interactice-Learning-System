/**
 * `npm run seed:demo:remove` — takes away exactly what `npm run seed:demo`
 * made, and nothing else.
 *
 * Every demo record carries the `DEMO` mark in its code or its title, and this
 * removes only records carrying it. A competency, module, question or paper a
 * real teacher authored has no mark and is never looked at twice.
 *
 * Order matters and is not negotiable. The learner is purged first, because
 * their attempts and path items reference the content; then the papers and
 * practice that reference the questions; then the questions; then the modules;
 * then the competencies everything else hangs off. A delete out of order is
 * refused by the database rather than cascading, which is the behaviour we
 * want — but doing it in the right order means it never has to refuse.
 */

import * as nextEnv from "@next/env";

import { DEMO_LEARNER, DEMO_MARK, assertLocalTargets, callApi, signIn } from "./demo-data.mjs";

const { loadEnvConfig } = nextEnv.default ?? nextEnv;
loadEnvConfig(process.cwd());

const env = process.env;

function say(message) {
  process.stdout.write(`${message}\n`);
}

/** What one record of each resource is called, for a readable report. */
const SINGULAR = {
  assessments: "assessment",
  activities: "activity",
  questions: "question",
  modules: "learning module",
  competencies: "competency",
};

/** Whether a record was made by the demo seed. */
function isDemo(row) {
  const code = typeof row.code === "string" ? row.code : "";
  const title = typeof row.title === "string" ? row.title : "";
  const prompt = typeof row.prompt === "string" ? row.prompt : "";
  const name = typeof row.name === "string" ? row.name : "";
  return [code, title, prompt, name].some((value) => value.includes(DEMO_MARK));
}

/** Every page of one resource, across all publication states. */
async function listEverything(token, resource) {
  const rows = [];
  for (const status of ["draft", "published", "archived"]) {
    let page = 1;
    for (;;) {
      const { data, meta } = await callApi(
        env,
        token,
        `/teacher-admin/${resource}?status=${status}&page=${page}&page_size=100`,
      );
      rows.push(...(data ?? []));
      if (!meta || page >= (meta.total_pages ?? 1)) break;
      page += 1;
    }
  }

  // Deduplicated by identity. Not every resource narrows by `status`, so the
  // same row can come back on each pass; without this it is deleted once and
  // then reported as failing twice more.
  const seen = new Map();
  for (const row of rows) {
    const id =
      row.assessment_id ?? row.activity_id ?? row.question_id ?? row.module_id ??
      row.competency_id ?? row.id;
    if (id && !seen.has(id)) seen.set(id, row);
  }
  return [...seen.values()];
}

/**
 * Archives then permanently removes one record.
 *
 * Archiving first because the permanent delete is only offered for content
 * that is out of a learner's way; tolerant of a refusal because a record
 * something still points at is correctly protected, and saying so beats
 * pretending the removal worked.
 */
async function remove(token, resource, id, label, failures) {
  try {
    await callApi(env, token, `/teacher-admin/${resource}/${id}`, { method: "DELETE" });
  } catch {
    // Already archived, which is all this step wanted.
  }
  try {
    await callApi(env, token, `/teacher-admin/${resource}/${id}/delete`, { method: "POST" });
    return true;
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    return false;
  }
}

async function removeLearner(token, failures) {
  // `status=all`: a learner dropped by an earlier run is no longer on the
  // enrolled roster, and leaving them unfound would strand every record that
  // still points at them.
  const { data } = await callApi(env, token, "/students?page_size=100&status=all");
  // Matched on the learner id rather than the address: the roster does not
  // carry an email, and the learner id is the value this seed sets itself.
  const learner = (data ?? []).find((row) => row.learner_id === DEMO_LEARNER.learnerId);
  if (!learner) {
    say("  no demo learner to remove");
    return;
  }

  const id = learner.student_id ?? learner.id;

  if (learner.account_status !== "dropped") {
    // Dropped first, and named by `user_ids`: dropping identifies the account,
    // while purging identifies the learner record. The purge refuses a learner
    // who is still enrolled, so removing one is always two decisions.
    await callApi(env, token, "/students/drop", {
      method: "POST",
      body: { user_ids: [learner.user_id] },
    });
  }

  try {
    await callApi(env, token, `/students/${id}/purge`, {
      method: "POST",
      body: { learner_id: DEMO_LEARNER.learnerId, acknowledged: true },
    });
    say("  the demo learner, with their attempts and learning path");
  } catch (error) {
    failures.push(`the demo learner: ${error.message}`);
  }
}

async function main() {
  assertLocalTargets(env);

  const teacherEmail = env.E2E_TEACHER_ADMIN_EMAIL;
  const teacherPassword = env.E2E_TEACHER_ADMIN_PASSWORD;
  if (!teacherEmail || !teacherPassword) {
    throw new Error(
      "A Teacher/Administrator account is needed to remove the demo content. Set " +
        "E2E_TEACHER_ADMIN_EMAIL and E2E_TEACHER_ADMIN_PASSWORD for the local stack.",
    );
  }

  say("Removing MathSmart demo data from the local stack…");
  const token = await signIn(env, teacherEmail, teacherPassword);
  const failures = [];

  await removeLearner(token, failures);

  // The demo competencies, found first: a demo question is one that belongs to
  // one of them. Marking a question would mean putting "DEMO" in front of a
  // sentence a child reads, and the competency it hangs off says the same
  // thing without spoiling the content.
  const demoCompetencies = (await listEverything(token, "competencies")).filter(isDemo);
  const demoCompetencyIds = new Set(
    demoCompetencies.map((row) => row.competency_id ?? row.id),
  );

  // Dependency order, innermost reference first.
  for (const resource of ["assessments", "activities", "questions", "modules", "competencies"]) {
    const marked =
      resource === "questions"
        ? (await listEverything(token, resource)).filter((row) =>
            demoCompetencyIds.has(row.competency_id),
          )
        : (await listEverything(token, resource)).filter(isDemo);
    let removed = 0;
    for (const row of marked) {
      const id =
        row.assessment_id ?? row.activity_id ?? row.question_id ?? row.module_id ??
        row.competency_id ?? row.id;
      const label = `${SINGULAR[resource]} ${row.title ?? row.code ?? id}`;
      if (await remove(token, resource, id, label, failures)) removed += 1;
    }
    say(`  ${removed} of ${marked.length} ${resource}`);
  }

  if (failures.length > 0) {
    // Almost always one cause: somebody other than the demo learner opened a
    // demo lesson or practice, and their attempt now points at it. The server
    // refuses to remove content under a learner's evidence, and that refusal
    // is right — a clean-up script has no business deleting work it did not
    // make. So this reports it and leaves both alone.
    say("");
    say("Some demo records were kept because a learner's work still points at them:");
    for (const failure of failures) say(`  - ${failure}`);
    say("");
    say("Sign in as that learner is not needed. Either leave the content in place,");
    say("or ask a Teacher/Administrator to remove those attempts first, then run");
    say("npm run seed:demo:remove again.");
    process.exitCode = 1;
    return;
  }

  say("");
  say("Done. Nothing carrying the demo mark is left.");
}

main().catch((error) => {
  process.stderr.write(`\n${error.message}\n`);
  process.exitCode = 1;
});
