import { STUDENT_ACCOUNT, TEACHER_ADMIN_ACCOUNT } from "./accounts.js";

/**
 * Disposable records created through the API rather than the interface.
 *
 * The competency a content-authoring run needs is not what that run is about.
 * Driving module 4's dialog to get one couples this suite to copy it does not
 * own — and it already broke once that way. Creating it through the same
 * authenticated route the workspace uses keeps the authorization real while
 * leaving the interface assertions to the modules under test.
 *
 * Nothing here invents a credential: the token comes from signing in as the
 * same account the browser uses, and the caller's own role decides what the
 * API allows.
 */

/** Signs in against the configured Supabase project and returns an access token. */
export async function accessToken(request) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const response = await request.post(`${base}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key, "Content-Type": "application/json" },
    data: {
      email: TEACHER_ADMIN_ACCOUNT.email,
      password: TEACHER_ADMIN_ACCOUNT.password,
    },
  });

  if (!response.ok()) {
    throw new Error(`The fixture account could not sign in: ${response.status()}`);
  }

  const body = await response.json();
  return body.access_token;
}

/** One authenticated call against the MathSmart API. */
export async function api(request, token, path, { method = "GET", data } = {}) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;

  return request.fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data,
  });
}

/**
 * A published Grade 6 competency for a run to hang its content off.
 *
 * Published, because a question cannot be published under a draft competency
 * and a module cannot be published under one either — which is the rule the
 * modules under test are supposed to enforce, not work around.
 */
export async function createCompetency(request, token, { code, name }) {
  const created = await api(request, token, "/teacher-admin/competencies", {
    method: "POST",
    data: {
      code,
      name,
      domain: "Numbers and Number Sense",
      description: "Created by the browser suite. Safe to remove.",
      status: "draft",
    },
  });

  if (!created.ok()) {
    throw new Error(`The disposable competency could not be created: ${created.status()}`);
  }

  const { data } = await created.json();

  const published = await api(
    request,
    token,
    `/teacher-admin/competencies/${data.competency_id}`,
    { method: "PATCH", data: { status: "published" } },
  );

  if (!published.ok()) {
    throw new Error(`The disposable competency could not be published: ${published.status()}`);
  }

  return data.competency_id;
}

/**
 * Removes a disposable competency, if nothing is left pointing at it.
 *
 * Deliberately tolerant. A competency something still holds is refused by the
 * database, and that refusal is the correct outcome rather than a cleanup
 * failure worth shouting about — the row is obviously test data and a person
 * can clear it once whatever is holding it is gone.
 */
export async function removeCompetency(request, token, competencyId) {
  if (!competencyId) {
    return;
  }

  await api(request, token, `/teacher-admin/competencies/${competencyId}`, {
    method: "DELETE",
  });
  await api(request, token, `/teacher-admin/competencies/${competencyId}/delete`, {
    method: "POST",
  });
}

/**
 * Signs in as the configured learner and returns an access token.
 *
 * The teacher token above authors content; this one is for reading a learner's
 * own standing back, which is the only way a specification can tell "this
 * paper is open to me" apart from "this paper exists".
 */
export async function studentAccessToken(request) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const response = await request.post(`${base}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key, "Content-Type": "application/json" },
    data: {
      email: STUDENT_ACCOUNT.email,
      password: STUDENT_ACCOUNT.password,
    },
  });

  if (!response.ok()) {
    throw new Error(`The learner fixture account could not sign in: ${response.status()}`);
  }

  return (await response.json()).access_token;
}

/**
 * A published question hung off a competency, with its answer key.
 *
 * The key is written here and never read back anywhere: `authenticated` holds
 * INSERT on that column and no SELECT at all, which is the property the
 * learner-facing tests then rely on.
 */
export async function createQuestion(request, token, { competencyId, prompt }) {
  const created = await api(request, token, "/teacher-admin/questions", {
    method: "POST",
    data: {
      competency_id: competencyId,
      question_type: "multiple_choice",
      difficulty: "easy",
      prompt,
      choices: [
        { key: "a", label: "3/4" },
        { key: "b", label: "3/8" },
        { key: "c", label: "1/2" },
        { key: "d", label: "2/4" },
      ],
      answer_key: "a",
      explanation: "The bottom numbers match, so only the top numbers are added.",
      hint: "Look at the bottom numbers first.",
      status: "published",
    },
  });

  if (!created.ok()) {
    throw new Error(`The disposable question could not be created: ${created.status()}`);
  }

  return (await created.json()).data.question_id;
}

/**
 * A published unit quiz with one question, for a learner to sit.
 *
 * Created per run rather than seeded once, because sitting a paper changes it:
 * a specification that reaches for whatever happens to be published finds it
 * already finished the second time it runs, and skips for a reason that has
 * nothing to do with the code.
 */
export async function createPublishedAssessment(request, token, { title, questionIds }) {
  const created = await api(request, token, "/teacher-admin/assessments", {
    method: "POST",
    data: {
      title,
      assessment_type: "unit_quiz",
      duration_minutes: 15,
      description: "Created by the browser suite. Safe to remove.",
      status: "draft",
    },
  });

  if (!created.ok()) {
    throw new Error(`The disposable assessment could not be created: ${created.status()}`);
  }

  const assessmentId = (await created.json()).data.assessment_id;

  const seated = await api(
    request,
    token,
    `/teacher-admin/assessments/${assessmentId}/questions`,
    { method: "PUT", data: { question_ids: questionIds } },
  );
  if (!seated.ok()) {
    throw new Error(`The disposable assessment could not be filled: ${seated.status()}`);
  }

  const published = await api(
    request,
    token,
    `/teacher-admin/assessments/${assessmentId}/publish`,
    { method: "POST", data: {} },
  );
  if (!published.ok()) {
    throw new Error(`The disposable assessment could not be published: ${published.status()}`);
  }

  return assessmentId;
}

/**
 * Removes a disposable assessment, tolerantly.
 *
 * An assessment somebody has sat is refused by the database, and that refusal
 * is the correct outcome rather than a cleanup failure worth shouting about.
 */
export async function removeAssessment(request, token, assessmentId) {
  if (!assessmentId) return;
  await api(request, token, `/teacher-admin/assessments/${assessmentId}`, { method: "DELETE" });
  await api(request, token, `/teacher-admin/assessments/${assessmentId}/delete`, {
    method: "POST",
  });
}

/**
 * Sits a paper as the learner and submits one deliberately wrong answer.
 *
 * Done through the API rather than the interface because it is a fixture, not
 * a subject: the review tests need a closed attempt with something marked
 * incorrect, and driving the player to produce one makes those tests depend on
 * the player they are not testing.
 *
 * The wrong answer is the point. A paper answered correctly has nothing to
 * review and nothing to explain, and the tests that follow would skip rather
 * than run.
 */
export async function sitAndSubmit(request, studentToken, assessmentId) {
  const started = await api(request, studentToken, `/assessments/${assessmentId}/attempts`, {
    method: "POST",
    data: {},
  });
  if (!started.ok()) {
    throw new Error(`The fixture attempt could not be started: ${started.status()}`);
  }

  const attempt = (await started.json()).data;
  const answers = attempt.questions.map((question) => ({
    question_id: question.id,
    // The last choice, because every fixture question is keyed to the first.
    answer: question.choices?.at(-1)?.key ?? "z",
  }));

  const submitted = await api(
    request,
    studentToken,
    `/assessment-attempts/${attempt.attempt_id}/submit`,
    { method: "POST", data: { answers } },
  );
  if (!submitted.ok()) {
    throw new Error(`The fixture attempt could not be submitted: ${submitted.status()}`);
  }

  return attempt.attempt_id;
}
