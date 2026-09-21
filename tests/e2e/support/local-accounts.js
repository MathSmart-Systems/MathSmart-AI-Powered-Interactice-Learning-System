/**
 * Throwaway accounts and inboxes on the local stack, for tests that change an
 * account itself.
 *
 * Changing a sign-in email cannot be tested on the shared test accounts: every
 * other specification signs in with them. So a test that does it makes its own
 * Teacher/Administrator, uses it, and removes it. Nothing here runs unless every
 * target is local (see `environment.js`), and the local Auth admin key it needs
 * is the one `npm run env:local` writes into `.env.local` from `supabase status`.
 *
 * There is no API that provisions a Teacher/Administrator, so the profile rows
 * are written straight into the local database container. That is a local
 * fixture's shortcut and nothing else.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? "supabase_db_mathsmart";
const MAILPIT_URL = (process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324").replace(/\/+$/, "");

function authAdmin(path, { method = "GET", body } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("The local Supabase URL and secret key are not configured.");
  return fetch(`${url}/auth/v1${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** One statement against the local database, as its superuser. */
export function localSql(sql) {
  return execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

/** True when the local fixtures can run here at all. */
export function localFixturesAvailable() {
  if (!process.env.SUPABASE_SECRET_KEY) return false;
  try {
    return localSql("select 1") === "1";
  } catch {
    return false;
  }
}

/**
 * A Teacher/Administrator who exists only for one test.
 *
 * @returns {Promise<{id: string, email: string, password: string}>}
 */
export async function createThrowawayTeacher(label) {
  const email = `e2e.${label}.${Date.now()}.${randomUUID().slice(0, 6)}@mathsmart.test`;
  const password = `Throwaway-${randomUUID()}`;
  const response = await authAdmin("/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true, app_metadata: { role: "teacher_admin" } },
  });
  if (!response.ok) throw new Error(`The local Auth admin API refused to create a teacher (${response.status}).`);
  const user = await response.json();

  // One transaction, so a refused row never leaves half a teacher behind.
  localSql(`
    begin;
    insert into app.user_profiles (user_id, full_name, email, role)
    values ('${user.id}', 'Throwaway Teacher', '${email}', 'teacher_admin');
    insert into app.teacher_admin_profiles (user_id, employee_id, school_name, division_name)
    values ('${user.id}', 'E2E-${user.id.slice(0, 8).toUpperCase()}', 'MathSmart Local School', 'MathSmart Local Division');
    commit;
  `);
  return { id: user.id, email, password };
}

export async function removeThrowawayTeacher(account) {
  if (!account?.id) return;
  try {
    localSql(`delete from app.audit_events where actor_user_id = '${account.id}';`);
  } catch {
    // Audit rows may be protected; the Auth delete below still tidies the rest.
  }
  await authAdmin(`/admin/users/${account.id}`, { method: "DELETE" }).catch(() => null);
}

/** The Auth record as Supabase holds it: the confirmed email and any pending one. */
export async function authEmails(id) {
  const response = await authAdmin(`/admin/users/${id}`);
  const user = await response.json();
  return { email: user.email ?? null, pending: user.new_email || null };
}

/** The email stored on the application profile. */
export function profileEmail(id) {
  return localSql(`select email from app.user_profiles where user_id = '${id}';`);
}

/**
 * The confirmation link in the newest message to one address, waiting for it
 * to arrive.
 */
export async function confirmationLink(address, { timeoutMs = 15_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
    const found = await search.json();
    const newest = found?.messages?.[0];
    if (newest) {
      const message = await (await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`)).json();
      const body = `${message.Text ?? ""} ${message.HTML ?? ""}`;
      const link = /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/.exec(body)?.[0];
      if (link) return link.replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`No confirmation email reached ${address}.`);
}

/**
 * Asks for an email change as the account itself, through Supabase Auth, so a
 * test can have a pending change without the Settings form (which a
 * deployment may have paused).
 */
export async function requestEmailChangeAs(account, newEmail) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const signIn = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const { access_token: token } = await signIn.json();
  const redirect = encodeURIComponent(`${process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100"}/auth/email-change/confirm`);
  const response = await fetch(`${base}/auth/v1/user?redirect_to=${redirect}`, {
    method: "PUT",
    headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: newEmail }),
  });
  if (!response.ok) throw new Error(`The email change could not be requested (${response.status}).`);
}

/** Whether a password sign-in with these credentials succeeds. */
export async function canSignIn(email, password) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return response.ok;
}
