import { expect, test } from "@playwright/test";

import { accessToken, api } from "../support/api-fixtures.js";
import { STUDENT_ACCOUNT, TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts.js";
import { hostedDataSkipReason, isLocalDataEnvironment } from "../support/environment.js";
import {
  authEmails,
  canSignIn,
  confirmationLink,
  createThrowawayTeacher,
  localFixturesAvailable,
  profileEmail,
  removeThrowawayTeacher,
  requestEmailChangeAs,
} from "../support/local-accounts.js";

/** Requests are paused unless the deployment turns them on (see `.env.example`). */
const EMAIL_CHANGE_ON = process.env.NEXT_PUBLIC_EMAIL_CHANGE_ENABLED === "true";

/**
 * Teacher Settings: the Groq classroom setting and the sign-in email.
 *
 * The Groq switch is checked where it matters, on the server: turning it off
 * must make an advisory request fail even when the page is bypassed, while
 * the deterministic report keeps working. The email change is followed through
 * the real Supabase flow and the local Mailpit inbox, on a throwaway account,
 * and at each step the confirmed address — on screen, in Auth and in the
 * profile table — is checked to be the only one that ever counts.
 */

const describe = hasAccount(TEACHER_ADMIN_ACCOUNT) ? test.describe : test.describe.skip;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 375, height: 812 },
];

async function openSettings(page, tab = null) {
  await page.goto(`/teacher/settings${tab ? `?tab=${tab}` : ""}`);
  await expect(page.getByRole("heading", { name: "Teacher Settings" })).toBeVisible({ timeout: 20_000 });
}

async function studentToken(request) {
  const response = await request.post(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      data: { email: STUDENT_ACCOUNT.email, password: STUDENT_ACCOUNT.password },
    },
  );
  return (await response.json()).access_token;
}

describe("teacher settings: Groq", () => {
  test("the status separates the server from the classroom setting and never shows the key", async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/**");
    await openSettings(page);

    const panel = page.getByRole("region", { name: "AI suggestions (Groq)" });
    await expect(panel.getByTestId("groq-server")).toHaveText(/^(Configured|Not configured)$/);
    await expect(panel.getByTestId("groq-classroom")).toHaveText(/^(On|Off)$/);
    await expect(panel.getByTestId("groq-status")).toHaveText(/^(Enabled|Disabled|Unavailable)$/);
    await expect(panel.getByText("It cannot be viewed or edited here.")).toBeVisible();
    await expect(page.getByRole("switch", { name: "Allow AI suggestions" })).toBeVisible();

    const text = (await page.locator("main").innerText()).toLowerCase();
    for (const secret of ["gsk_", "api_key", "sk-", "secret"]) expect(text).not.toContain(secret);
  });

  test("a failed save puts the switch back and says so", async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/**");
    await openSettings(page);
    const toggle = page.getByRole("switch", { name: "Allow AI suggestions" });
    const before = await toggle.getAttribute("aria-checked");

    await page.route("**/teacher-admin/settings", (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 500, contentType: "application/json", body: '{"error":{"code":"server_error","message":"x"}}' })
        : route.fallback(),
    );
    await toggle.scrollIntoViewIfNeeded();
    const top = await page.evaluate(() => window.scrollY);
    await toggle.click();

    await expect(page.getByRole("alert").filter({ hasText: "could not be changed" })).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", before);
    expect(await page.evaluate(() => window.scrollY)).toBe(top);
  });

  test("a learner can neither read nor change settings", async ({ request }) => {
    test.skip(!hasAccount(STUDENT_ACCOUNT), "no learner account configured");
    const token = await studentToken(request);
    expect((await api(request, token, "/teacher-admin/settings")).status()).toBe(403);
    const write = await api(request, token, "/teacher-admin/settings", {
      method: "PATCH",
      data: { settings: { "features.groq_advisory": true } },
    });
    expect(write.status()).toBe(403);
  });

  test("a learner is sent away from the settings page", async ({ page }) => {
    test.skip(!hasAccount(STUDENT_ACCOUNT), "no learner account configured");
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL("**/student/**");
    await page.goto("/teacher/settings");
    await expect(page).toHaveURL(/\/student\//);
  });

  test.describe("the switch is enforced by the server", () => {
    test.skip(!isLocalDataEnvironment(), hostedDataSkipReason());

    test("turning it off stops advice everywhere, keeps the report, and is audited", async ({ page, request }) => {
      const token = await accessToken(request);
      const original = (await (await api(request, token, "/teacher-admin/settings")).json()).data.groq
        .classroom_enabled;

      try {
        await signIn(page, TEACHER_ADMIN_ACCOUNT);
        await page.waitForURL("**/teacher/**");
        await openSettings(page);
        const toggle = page.getByRole("switch", { name: "Allow AI suggestions" });

        if ((await toggle.getAttribute("aria-checked")) === "true") {
          await toggle.click();
          await expect(page.getByRole("status").filter({ hasText: "AI suggestions turned off." })).toBeVisible();
        }
        await expect(toggle).toHaveAttribute("aria-checked", "false");
        await expect(page.getByTestId("groq-classroom")).toHaveText("Off");

        // Persisted: a fresh page reads Off from the server.
        await page.reload();
        await expect(page.getByRole("switch", { name: "Allow AI suggestions" })).toHaveAttribute("aria-checked", "false");

        // Enforced: a direct request, with no page in the way, is refused.
        const insight = await api(request, token, "/ai/teacher-insight", {
          method: "POST",
          data: { competency_id: null, current_score: 40, diagnostic_score: 30 },
        });
        expect([503, 422]).toContain(insight.status());
        const summary = await api(request, token, "/teacher-admin/reports/summary", { method: "POST", data: {} });
        expect(summary.status()).toBe(503);
        expect((await summary.json()).error.code).toBe("groq_assistance_unavailable");

        // The deterministic report does not notice.
        expect((await api(request, token, "/teacher-admin/reports/overview")).status()).toBe(200);
        expect((await api(request, token, "/teacher-admin/dashboard")).status()).toBe(200);

        // Audited, as a change from one value to the other.
        await page.getByRole("button", { name: /Recent Changes History/ }).click();
        await expect(page.getByText(/AI suggestions changed from On to Off/).first()).toBeVisible();
      } finally {
        await api(request, token, "/teacher-admin/settings", {
          method: "PATCH",
          data: { settings: { "features.groq_advisory": original } },
        });
      }
    });
  });
});

describe("teacher settings: sign-in email", () => {
  test.skip(!isLocalDataEnvironment(), hostedDataSkipReason());
  test.skip(!localFixturesAvailable(), "the local database container or Auth admin key is not available");

  for (const viewport of VIEWPORTS) {
    test(`an email change counts only once both links are confirmed (${viewport.name})`, async ({ page }) => {
      test.skip(!EMAIL_CHANGE_ON, "email-change requests are paused on this deployment");
      test.setTimeout(90_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const account = await createThrowawayTeacher(`email-${viewport.name}`);
      const newEmail = account.email.replace("@", ".new@");

      try {
        await signIn(page, account);
        await page.waitForURL("**/teacher/**");
        await openSettings(page, "profile");

        const current = page.getByTestId("current-email");
        const field = page.getByLabel("New email address");
        const send = page.getByRole("button", { name: "Send confirmation links" });
        await expect(current).toHaveText(account.email);

        // Refused before anything is sent.
        await field.fill(account.email.toUpperCase());
        await send.click();
        await expect(page.getByText("That is already your email address.")).toBeVisible();
        await field.fill("not-an-email");
        await send.click();
        await expect(page.getByText(/Enter a valid email address/)).toBeVisible();

        // Requested, with the page kept where it was.
        await field.fill(`  ${newEmail.toUpperCase()} `);
        await send.scrollIntoViewIfNeeded();
        const top = await page.evaluate(() => window.scrollY);
        await send.click();
        await expect(page.getByRole("status").filter({ hasText: "Check both inboxes" })).toBeVisible();
        expect(await page.evaluate(() => window.scrollY)).toBe(top);
        await expect(page.getByLabel("Loading settings")).toHaveCount(0);

        // Nothing has changed yet, anywhere.
        await expect(current).toHaveText(account.email);
        await expect(page.getByTestId("pending-email")).toHaveText(newEmail);
        expect(await authEmails(account.id)).toEqual({ email: account.email, pending: newEmail });
        expect(profileEmail(account.id)).toBe(account.email);

        // The first link, from the current address: still nothing changes.
        const first = await confirmationLink(account.email);
        await page.goto(first);
        await expect(page).toHaveURL(/\/teacher\/settings/);
        await expect(page.getByRole("status").filter({ hasText: "One link confirmed" })).toBeVisible();
        await expect(page.getByTestId("current-email")).toHaveText(account.email);
        expect(profileEmail(account.id)).toBe(account.email);

        // The second, from the new address: now it is the account's email.
        const second = await confirmationLink(newEmail);
        await page.goto(second);
        await expect(page.getByRole("status").filter({ hasText: "has been changed" })).toBeVisible();
        await expect(page.getByTestId("current-email")).toHaveText(newEmail);
        await expect(page.getByTestId("pending-email")).toHaveCount(0);
        expect((await authEmails(account.id)).email).toBe(newEmail);
        expect(profileEmail(account.id)).toBe(newEmail);

        // A used link changes nothing and says so.
        await page.goto(first);
        await expect(page.getByRole("alert").filter({ hasText: "expired or was already used" })).toBeVisible();
        expect(profileEmail(account.id)).toBe(newEmail);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      } finally {
        await removeThrowawayTeacher(account);
      }
    });
  }

  test("an address that belongs to someone else gets the same answer as any other", async ({ page }) => {
    test.skip(!EMAIL_CHANGE_ON, "email-change requests are paused on this deployment");
    test.skip(!hasAccount(STUDENT_ACCOUNT), "no second account to collide with");
    const account = await createThrowawayTeacher("email-taken");
    try {
      await signIn(page, account);
      await page.waitForURL("**/teacher/**");
      await openSettings(page, "profile");
      await page.getByLabel("New email address").fill(STUDENT_ACCOUNT.email);
      await page.getByRole("button", { name: "Send confirmation links" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Check both inboxes" })).toBeVisible();
      await expect(page.getByTestId("current-email")).toHaveText(account.email);
      expect(profileEmail(account.id)).toBe(account.email);
    } finally {
      await removeThrowawayTeacher(account);
    }
  });

  test("while paused, no request can be made but the rest of the card works", async ({ page }) => {
    test.skip(EMAIL_CHANGE_ON, "requests are turned on for this deployment");
    const account = await createThrowawayTeacher("email-paused");
    try {
      await signIn(page, account);
      await page.waitForURL("**/teacher/**");
      await openSettings(page, "profile");
      await expect(page.getByTestId("email-change-paused")).toBeVisible();
      await expect(page.getByLabel("New email address")).toBeHidden();
      await expect(page.getByTestId("current-email")).toHaveText(account.email);
    } finally {
      await removeThrowawayTeacher(account);
    }
  });

  for (const viewport of VIEWPORTS) {
    test(`a pending change can be cancelled, and its links stop working (${viewport.name})`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const account = await createThrowawayTeacher(`email-cancel-${viewport.name}`);
      const newEmail = account.email.replace("@", ".new@");

      try {
        await requestEmailChangeAs(account, newEmail);
        const links = [await confirmationLink(account.email), await confirmationLink(newEmail)];

        await signIn(page, account);
        await page.waitForURL("**/teacher/**");
        await openSettings(page, "profile");
        await expect(page.getByTestId("pending-email")).toHaveText(newEmail);

        const cancel = page.getByRole("button", { name: "Cancel pending change" });
        await cancel.scrollIntoViewIfNeeded();
        const top = await page.evaluate(() => window.scrollY);
        await cancel.click();

        await expect(page.getByRole("status").filter({ hasText: "Pending email change cancelled" })).toBeVisible();
        await expect(page.getByTestId("pending-email")).toHaveCount(0);
        await expect(page.getByTestId("current-email")).toHaveText(account.email);
        expect(Math.abs((await page.evaluate(() => window.scrollY)) - top)).toBeLessThanOrEqual(1);

        // Server-side: nothing pending, the email unchanged, the old sign-in fine.
        expect(await authEmails(account.id)).toEqual({ email: account.email, pending: null });
        expect(profileEmail(account.id)).toBe(account.email);
        expect(await canSignIn(account.email, account.password)).toBe(true);

        // Both links from the cancelled request are refused and change nothing.
        for (const link of links) {
          await page.goto(link);
          await expect(page.getByRole("alert").filter({ hasText: "expired or was already used" })).toBeVisible();
        }
        expect(await authEmails(account.id)).toEqual({ email: account.email, pending: null });
        expect(profileEmail(account.id)).toBe(account.email);
      } finally {
        await removeThrowawayTeacher(account);
      }
    });
  }
});
