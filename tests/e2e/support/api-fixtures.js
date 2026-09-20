import { TEACHER_ADMIN_ACCOUNT } from "./accounts.js";

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
