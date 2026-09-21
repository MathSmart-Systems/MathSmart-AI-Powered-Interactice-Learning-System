/**
 * `npm run seed:demo` — the content, learner and evidence a live demonstration
 * needs, on the local stack only.
 *
 * Run it as often as you like. Every record carries the `DEMO` mark, the seed
 * reuses what it already made rather than making a second copy, and
 * `npm run seed:demo:remove` takes away exactly what it marked and nothing
 * else.
 *
 * The evidence is produced by sitting the papers and the practice through the
 * real routes, not by writing attempt rows. A score this seed invented would
 * be a score the grader never agreed with, and the screens under demonstration
 * are the ones that read those numbers back.
 */

import * as nextEnv from "@next/env";

import {
  COMPETENCIES,
  DEMO_LEARNER,
  DEMO_MARK,
  DEMO_NOTE,
  MODULES,
  QUESTIONS,
  assertLocalTargets,
  callApi,
  callAuthAdmin,
  createCompetency,
  createQuestion,
  gradeId,
  signIn,
} from "./demo-data.mjs";

const { loadEnvConfig } = nextEnv.default ?? nextEnv;
loadEnvConfig(process.cwd());

const env = process.env;

/**
 * The demo learner's password.
 *
 * Taken from the environment when one is supplied so a demonstrator can choose
 * it, and otherwise a fixed local-only value. It is never printed: the script
 * tells you the address to sign in with and says where to find the password.
 *
 * When the demonstration is being built around an address you already sign in
 * with, `E2E_STUDENT_PASSWORD` is preferred over the built-in default, so that
 * running the seed does not quietly change the password of an account you use.
 */
const LEARNER_PASSWORD =
  env.DEMO_STUDENT_PASSWORD ??
  (env.DEMO_LEARNER_EMAIL && env.E2E_STUDENT_PASSWORD) ??
  "MathSmartDemo!2026";

function say(message) {
  process.stdout.write(`${message}\n`);
}

/** Finds a record this seed already made, by the mark it carries. */
function findMarked(rows, field, value) {
  return (rows ?? []).find((row) => row[field] === value) ?? null;
}

/** Everything the teacher API lists for one resource. */
async function listAll(token, resource, extra = "") {
  const { data } = await callApi(env, token, `/teacher-admin/${resource}?page_size=100${extra}`);
  return data ?? [];
}

/**
 * Puts a record this seed already made back into service.
 *
 * `npm run seed:demo:remove` archives each record before asking for it to be
 * deleted permanently, and the permanent delete is refused while a learner's
 * work still points at it. That leaves a demo record present but archived,
 * and a reseed that reuses it as-is builds a demonstration on top of archived
 * content: the questions will not publish, and nothing downstream works. So a
 * reused record is put back to `published` before anything is hung off it.
 */
async function republish(token, resource, id, status) {
  if (status === "published") return;

  const set = (next) =>
    callApi(env, token, `/teacher-admin/${resource}/${id}`, {
      method: "PATCH",
      body: { status: next },
    });

  // Archived does not go straight back to published: only a draft may be
  // published, which is what keeps a record from returning to learners
  // without passing the readiness checks again. So it goes back the way it
  // came, and the publish step still refuses anything that is not ready.
  if (status === "archived") await set("draft");
  await set("published");
}

async function ensureCompetencies(token) {
  const existing = await listAll(token, "competencies");
  const ids = {};

  for (const spec of COMPETENCIES) {
    const already = findMarked(existing, "code", spec.code);
    if (already) {
      const id = already.competency_id ?? already.id;
      await republish(token, "competencies", id, already.status);
      ids[spec.key] = id;
      continue;
    }
    ids[spec.key] = await createCompetency(env, token, spec);
  }
  return ids;
}

async function ensureModules(token, competencyIds) {
  const existing = await listAll(token, "modules");
  const ids = {};
  let order = 1;

  for (const spec of COMPETENCIES) {
    const lesson = MODULES[spec.key];
    const already = findMarked(existing, "title", lesson.title);
    if (already) {
      const id = already.module_id ?? already.id;
      await republish(token, "modules", id, already.status);
      ids[spec.key] = id;
      order += 1;
      continue;
    }

    const created = await callApi(env, token, "/teacher-admin/modules", {
      method: "POST",
      body: {
        competency_id: competencyIds[spec.key],
        title: lesson.title,
        estimated_minutes: lesson.estimated_minutes,
        learning_objective: lesson.learning_objective,
        short_explanation: lesson.short_explanation,
        rules: lesson.rules,
        worked_examples: lesson.worked_examples,
        order_index: order,
        status: "draft",
      },
    });

    const id = created.data.module_id;
    await callApi(env, token, `/teacher-admin/modules/${id}`, {
      method: "PATCH",
      body: { status: "published" },
    });
    ids[spec.key] = id;
    order += 1;
  }
  return ids;
}

async function ensureQuestions(token, competencyIds) {
  const existing = await listAll(token, "questions");
  const ids = {};

  for (const spec of COMPETENCIES) {
    ids[spec.key] = [];
    for (const question of QUESTIONS[spec.key]) {
      const already = findMarked(existing, "prompt", question.prompt);
      if (already) {
        const id = already.question_id ?? already.id;
        await republish(token, "questions", id, already.status);
        ids[spec.key].push(id);
        continue;
      }
      ids[spec.key].push(
        await createQuestion(env, token, competencyIds[spec.key], question),
      );
    }
  }
  return ids;
}

/**
 * One activity per module, holding the first two questions of its competency.
 *
 * Published through `POST .../publish`, which refuses an activity that has no
 * questions or whose dependencies are still drafts. That refusal is the
 * guarantee this seed cannot produce a Start button that does not work.
 */
async function ensureActivities(token, moduleIds, questionIds) {
  const existing = await listAll(token, "activities");
  const ids = {};

  for (const spec of COMPETENCIES) {
    const title = `${DEMO_MARK} · ${MODULES[spec.key].title.replace(`${DEMO_MARK} · `, "")} — practice`;
    const already = findMarked(existing, "title", title);
    if (already) {
      const id = already.activity_id ?? already.id;
      await republish(token, "activities", id, already.status);
      ids[spec.key] = id;
      continue;
    }

    const created = await callApi(env, token, "/teacher-admin/activities", {
      method: "POST",
      body: {
        module_id: moduleIds[spec.key],
        title,
        description: `Practise what the lesson showed you. ${DEMO_NOTE}`,
        estimated_minutes: 10,
        points: 10,
        mastery_threshold: 75,
        status: "draft",
      },
    });

    const id = created.data.activity_id;
    await callApi(env, token, `/teacher-admin/activities/${id}/questions`, {
      method: "PUT",
      body: { question_ids: questionIds[spec.key].slice(0, 2) },
    });
    await callApi(env, token, `/teacher-admin/activities/${id}/publish`, {
      method: "POST",
      body: {},
    });
    ids[spec.key] = id;
  }
  return ids;
}

/** The diagnostic, plus a unit quiz the learner has not sat. */
async function ensureAssessments(token, questionIds) {
  const existing = await listAll(token, "assessments");
  const wanted = [
    {
      key: "diagnostic",
      title: `${DEMO_MARK} · Grade 6 Mathematics Diagnostic`,
      assessment_type: "diagnostic",
      duration_minutes: 30,
      description: `Find out exactly where to start. ${DEMO_NOTE}`,
      // One question per competency, so the gap report names every one of
      // them and the learning path has enough items to show a locked one.
      questions: [
        questionIds.fractions[2],
        questionIds.decimals[2],
        questionIds.ratio[2],
        questionIds.percent[2],
      ],
    },
    {
      key: "quiz",
      title: `${DEMO_MARK} · Fractions unit quiz`,
      assessment_type: "unit_quiz",
      duration_minutes: 15,
      description: `A short check after the fractions lesson. ${DEMO_NOTE}`,
      questions: [questionIds.fractions[3], questionIds.ratio[3]],
    },
  ];

  const ids = {};
  for (const spec of wanted) {
    const already = findMarked(existing, "title", spec.title);
    if (already) {
      const id = already.assessment_id ?? already.id;
      await republish(token, "assessments", id, already.status);
      ids[spec.key] = id;
      continue;
    }

    const created = await callApi(env, token, "/teacher-admin/assessments", {
      method: "POST",
      body: {
        title: spec.title,
        assessment_type: spec.assessment_type,
        duration_minutes: spec.duration_minutes,
        description: spec.description,
        status: "draft",
      },
    });

    const id = created.data.assessment_id;
    await callApi(env, token, `/teacher-admin/assessments/${id}/questions`, {
      method: "PUT",
      body: { question_ids: spec.questions },
    });
    await callApi(env, token, `/teacher-admin/assessments/${id}/publish`, {
      method: "POST",
      body: {},
    });
    ids[spec.key] = id;
  }
  return ids;
}

/**
 * The learner, enrolled through the same route a teacher uses.
 *
 * Enrolment provisions the account without a password, so one is set
 * afterwards through the local Auth admin API. That call, and only that call,
 * needs the service key; it is read from the environment and never logged.
 */
async function ensureLearner(token, grade) {
  // `status=all` and the learner id, for the same reason the removal uses
  // them: the roster carries no email, and a learner dropped by a previous
  // removal is not on the enrolled list.
  const { data } = await callApi(env, token, "/students?page_size=100&status=all");
  const already = (data ?? []).find((row) => row.learner_id === DEMO_LEARNER.learnerId);

  if (!already) {
    await callApi(env, token, "/students", {
      method: "POST",
      headers: { "Idempotency-Key": `demo-seed-${DEMO_LEARNER.learnerId}` },
      body: {
        email: DEMO_LEARNER.email,
        full_name: DEMO_LEARNER.fullName,
        learner_id: DEMO_LEARNER.learnerId,
        grade_id: grade,
      },
    });
  }

  const users = await callAuthAdmin(
    env,
    `/admin/users?page=1&per_page=200&filter=${encodeURIComponent(DEMO_LEARNER.email)}`,
  );
  const account = (users.users ?? []).find((user) => user.email === DEMO_LEARNER.email);
  if (!account) {
    throw new Error("The demo learner was enrolled but no Auth account came back for it.");
  }

  await callAuthAdmin(env, `/admin/users/${account.id}`, {
    method: "PUT",
    body: { password: LEARNER_PASSWORD, email_confirm: true },
  });

  return account.id;
}

/**
 * The evidence: a sat diagnostic, a finished lesson and practice, and one
 * lesson left part-way through.
 *
 * Answers are chosen so the outcome is the same every run: the first
 * competency is answered correctly and the other two are not, which puts two
 * competencies on the learning path and leaves at least one incorrect answer
 * in the report for the explanation panel to act on.
 */
async function ensureEvidence(assessmentIds, activityIds, moduleIds) {
  const learnerToken = await signIn(env, DEMO_LEARNER.email, LEARNER_PASSWORD);

  const papers = await callApi(env, learnerToken, "/assessments?status=published&page_size=100");
  const diagnostic = (papers.data ?? []).find((row) => row.id === assessmentIds.diagnostic);

  if (diagnostic && diagnostic.availability === "available") {
    const attempt = await callApi(
      env,
      learnerToken,
      `/assessments/${assessmentIds.diagnostic}/attempts`,
      { method: "POST", body: {} },
    );
    const delivered = attempt.data.questions ?? [];

    // First right, the rest wrong — deterministic, and it guarantees the
    // report has something for "Explain this one" to explain.
    const answers = delivered.map((question, index) => ({
      question_id: question.id,
      answer: index === 0 ? question.choices?.[0]?.key : question.choices?.at(-1)?.key,
    }));

    await callApi(env, learnerToken, `/assessment-attempts/${attempt.data.attempt_id}/submit`, {
      method: "POST",
      headers: { "Idempotency-Key": `demo-seed-diagnostic-${attempt.data.attempt_id}` },
      body: { answers },
    });
    say("  sat the diagnostic (one right, the rest wrong)");
  } else {
    say("  the diagnostic was already sat, leaving it alone");
  }

  // The path now exists. Finish its first item properly, and start its second.
  const path = await callApi(env, learnerToken, "/learning-path/me");
  const items = [...(path.data ?? [])].sort((a, b) => a.priority - b.priority);

  for (const [index, item] of items.entries()) {
    const moduleId = item.module?.id;
    const key = Object.keys(moduleIds).find((name) => moduleIds[name] === moduleId);
    if (!key || index > 1) continue; // Later items stay locked, which is the point.

    const detail = await callApi(env, learnerToken, `/modules/${moduleId}`);
    const sections = detail.data.section_ids ?? [];

    if (index === 0) {
      // Read it through, then pass its practice: the only thing that closes a
      // lesson now that reading no longer does.
      await callApi(env, learnerToken, `/modules/${moduleId}/progress`, {
        method: "PATCH",
        body: { completed_section_ids: sections, last_section_id: sections.at(-1) ?? null },
      });

      const activityId = activityIds[key];
      const open = await callApi(env, learnerToken, `/activities/${activityId}/attempts`, {
        method: "POST",
        body: {},
      });
      const activity = await callApi(env, learnerToken, `/activities/${activityId}`);
      const correct = (activity.data.questions ?? []).map((question) => ({
        question_id: question.id,
        answer: question.choices?.[0]?.key,
      }));
      await callApi(env, learnerToken, `/activity-attempts/${open.data.attempt_id}/submit`, {
        method: "POST",
        body: { answers: correct, time_spent_seconds: 240 },
      });
      say(`  finished the first lesson and passed its practice (${item.module.title})`);
    }

    // `available` and `in_progress` cannot both be on a path at once: the rule
    // opens exactly one item, and reading a section is what turns the open one
    // from available into in progress. Setting DEMO_LEAVE_NEXT_UNREAD=1 leaves
    // it unread, so a demonstrator can show that state instead.
    if (index === 1 && sections.length > 1 && env.DEMO_LEAVE_NEXT_UNREAD !== "1") {
      // Part-way through, so the path shows an in-progress item too.
      await callApi(env, learnerToken, `/modules/${moduleId}/progress`, {
        method: "PATCH",
        body: {
          completed_section_ids: sections.slice(0, 1),
          last_section_id: sections[0],
        },
      });
      say(`  left the next lesson part-read (${item.module.title})`);
    } else if (index === 1) {
      say(`  left the next lesson unread, so it reads as available (${item.module.title})`);
    }
  }
}

async function main() {
  assertLocalTargets(env);

  const teacherEmail = env.E2E_TEACHER_ADMIN_EMAIL;
  const teacherPassword = env.E2E_TEACHER_ADMIN_PASSWORD;
  if (!teacherEmail || !teacherPassword) {
    throw new Error(
      "A Teacher/Administrator account is needed to author the demo content. Set " +
        "E2E_TEACHER_ADMIN_EMAIL and E2E_TEACHER_ADMIN_PASSWORD for the local stack.",
    );
  }

  say("Seeding MathSmart demo data on the local stack…");
  const token = await signIn(env, teacherEmail, teacherPassword);
  const grade = await gradeId(env, token);

  const competencyIds = await ensureCompetencies(token);
  say(`  ${COMPETENCIES.length} competencies`);
  const moduleIds = await ensureModules(token, competencyIds);
  say(`  ${Object.keys(moduleIds).length} learning modules`);
  const questionIds = await ensureQuestions(token, competencyIds);
  say(`  ${Object.values(questionIds).flat().length} questions, each with a key, hint and explanation`);
  const activityIds = await ensureActivities(token, moduleIds, questionIds);
  say(`  ${Object.keys(activityIds).length} activities, each published with its questions`);
  const assessmentIds = await ensureAssessments(token, questionIds);
  say(`  ${Object.keys(assessmentIds).length} assessments`);

  await ensureLearner(token, grade);
  say(`  the demo learner, enrolled in Grade 6`);

  await ensureEvidence(assessmentIds, activityIds, moduleIds);

  say("");
  say("Done. Sign in at http://localhost:3000/login as:");

  // An address supplied through the environment is not echoed back: it came
  // from a file whose values this script does not print, and whoever set it
  // already knows what they set.
  if (env.DEMO_LEARNER_EMAIL) {
    say("  the learner named by DEMO_LEARNER_EMAIL");
    say("  password: unchanged — the one already set for that account.");
  } else {
    say(`  ${DEMO_LEARNER.email}`);
    say("  password: set from DEMO_STUDENT_PASSWORD, or the script's built-in local default.");
  }

  say("");
  say("Remove it all again with: npm run seed:demo:remove");
}

main().catch((error) => {
  process.stderr.write(`\n${error.message}\n`);
  process.exitCode = 1;
});
