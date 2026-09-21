import { expect, test } from "@playwright/test";

import { STUDENT_ACCOUNT, hasAccount, signIn } from "../support/accounts.js";
import { present, scrollBelowTheFold } from "../support/student-place.js";

/**
 * What a learner sees when Groq is switched on, and when it is not.
 *
 * The rest of the suite runs with `GROQ_ENABLED=false`, which proves the
 * fallbacks but leaves the enabled path unproven — the branch that actually
 * renders advisory text had no automated cover at all. Asking a real provider
 * would make the result depend on a paid third party and on whatever wording
 * it chose that day, so the provider's answer is stubbed at the network edge
 * and what is asserted is this application's behaviour: that the text appears,
 * that it is labelled as optional help, and that the deterministic verdict
 * beside it never moves.
 *
 * Nothing here sends a credential or inspects a provider request. The routes
 * are intercepted before they leave the browser.
 */

test.describe.configure({ mode: "serial" });

const { describe, beforeEach } = test;

/** A stubbed advisory reply, shaped exactly as the AI routes answer. */
function advisoryBody(field, text) {
  return {
    data: {
      [field]: text,
      provider: "groq",
      model: "stubbed-model",
      generated_at: new Date().toISOString(),
      confidence_score: null,
    },
  };
}

/**
 * Headers a stubbed reply has to carry.
 *
 * The application is served from one port and the API from another, so every
 * one of these calls is cross-origin. A fulfilled route does not inherit the
 * API's CORS headers, and without them the browser discards the reply before
 * any code sees it — which looks exactly like Groq being unavailable and would
 * have made these tests pass for the wrong reason.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};

/** Answers the preflight, then the request itself. */
function stub(page, pattern, reply) {
  return page.route(pattern, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    await route.fulfill({ ...reply, headers: { ...CORS, ...(reply.headers ?? {}) } });
  });
}

/** The refusal every Groq-side failure collapses to. */
const UNAVAILABLE = {
  status: 503,
  contentType: "application/json",
  body: JSON.stringify({
    error: {
      code: "groq_assistance_unavailable",
      message: "AI assistance is not available",
      request_id: "stub",
    },
  }),
};

async function openFinishedPaper(page) {
  await page.goto("/student/assessments");
  const card = page
    .locator('section[aria-labelledby="available-assessments-heading"]')
    .locator("ul > li")
    .filter({ hasText: "Finished" })
    .first();
  if (!(await present(card, 5_000))) return false;
  await card.getByRole("link").first().click();
  return true;
}

async function openAnActivity(page) {
  await page.goto("/student/activities");
  const open = page
    .locator("ul > li")
    .filter({ hasNot: page.getByText("Opens later") })
    .filter({ has: page.getByRole("link") })
    .filter({ hasText: /practice/i })
    .first();
  if (!(await present(open, 5_000))) return false;
  await open.getByRole("link").first().click();
  await page.getByText(/Question \d+/).first().waitFor({ timeout: 20_000 }).catch(() => {});
  return true;
}

describe("optional AI assistance", () => {
  test.skip(!hasAccount(STUDENT_ACCOUNT), "no student account is configured");

  beforeEach(async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL(/\/student\/dashboard/);
  });

  // ─── Assessments: explaining a wrong answer ──────────────────────

  test("an enabled explanation renders, labelled as optional help", async ({ page }) => {
    await stub(page, "**/ai/incorrect-answer-explanation", {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        advisoryBody("explanation", "Check the bottom numbers before you add the top ones."),
      ),
    });

    test.skip(!(await openFinishedPaper(page)), "this learner has finished nothing yet");
    await page.getByRole("button", { name: /Review my answers/ }).click();
    await page.getByText(/^(Correct|Not correct|Left blank)$/).first().waitFor();

    const explain = page.getByRole("button", { name: /Explain this one/ }).first();
    test.skip(!(await present(explain, 3_000)), "every answer on this attempt was correct");
    await explain.click();

    await expect(
      page.getByText("Check the bottom numbers before you add the top ones."),
    ).toBeVisible({ timeout: 15_000 });

    // Labelled, and labelled as advisory rather than as a result.
    await expect(page.getByText(/AI help .* advisory only, your score is unchanged/)).toBeVisible();
  });

  test("an explanation never alters the deterministic verdict", async ({ page }) => {
    // Deliberately contradicting the database. The verdict is not the
    // provider's to give, and must be unmoved by anything it says.
    await stub(page, "**/ai/incorrect-answer-explanation", {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        advisoryBody("explanation", "Actually your answer was correct and your score is 100%."),
      ),
    });

    test.skip(!(await openFinishedPaper(page)), "this learner has finished nothing yet");
    await page.getByRole("button", { name: /Review my answers/ }).click();

    const wrong = page.getByText("Not correct").first();
    test.skip(!(await present(wrong, 5_000)), "every answer on this attempt was correct");
    const before = await page.getByText("Not correct").count();

    await page.getByRole("button", { name: /Explain this one/ }).first().click();
    await expect(page.getByText(/Actually your answer was correct/)).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByText("Not correct")).toHaveCount(before);
    await expect(wrong).toBeVisible();
  });

  test("an unavailable explanation says so and leaves the result alone", async ({ page }) => {
    await stub(page, "**/ai/incorrect-answer-explanation", UNAVAILABLE);

    test.skip(!(await openFinishedPaper(page)), "this learner has finished nothing yet");
    await page.getByRole("button", { name: /Review my answers/ }).click();

    const explain = page.getByRole("button", { name: /Explain this one/ }).first();
    test.skip(!(await present(explain, 5_000)), "every answer on this attempt was correct");
    await scrollBelowTheFold(page);
    await explain.click();

    await expect(
      page.getByText(/The optional AI explanation is not available right now/),
    ).toBeVisible({ timeout: 15_000 });
    expect(await page.getByText(/^(Correct|Not correct|Left blank)$/).count()).toBeGreaterThan(0);
  });

  // ─── Assessments: the results summary ────────────────────────────

  test("an enabled results summary renders under an advisory label", async ({ page }) => {
    await stub(page, "**/ai/student-feedback", {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        advisoryBody("feedback_text", "You are close on fractions. Keep going with the lesson."),
      ),
    });

    test.skip(!(await openFinishedPaper(page)), "this learner has finished nothing yet");

    await expect(
      page.getByText("You are close on fractions. Keep going with the lesson."),
    ).toBeVisible({ timeout: 20_000 });
    // Labelled as advisory, but no vendor and no model identifier: naming
    // either to a Grade 6 learner tells them nothing they can act on.
    await expect(page.getByText("Advisory", { exact: true })).toBeVisible();
    await expect(page.getByText(/powered by Groq/)).toHaveCount(0);
    await expect(page.getByText(/gpt|openai|model/i)).toHaveCount(0);
  });

  test("an unavailable summary leaves the deterministic score in place", async ({ page }) => {
    await stub(page, "**/ai/student-feedback", UNAVAILABLE);

    test.skip(!(await openFinishedPaper(page)), "this learner has finished nothing yet");

    await expect(page.getByText(/AI assistance is currently unavailable/)).toBeVisible({
      timeout: 20_000,
    });
    // The report itself is untouched.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Review my answers/ })).toBeVisible();
  });

  // ─── Activities: the enhanced hint ───────────────────────────────

  test("an enabled hint renders beside the authored one, labelled optional", async ({ page }) => {
    await page.route("**/activity-attempts/*/hints", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: CORS });
        return;
      }
      const response = await route.fetch();
      const body = await response.json();
      // The authored hint is whatever the database gave; only the advisory
      // rephrasing is stubbed, so the two can be told apart on screen.
      body.data.ai_hint = "Try thinking of the quarters as slices of one cake.";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: CORS,
        body: JSON.stringify(body),
      });
    });

    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");

    const hint = page.getByRole("button", { name: /Need a hint\?/ });
    test.skip(!(await present(hint, 5_000)), "this question offers no hint");
    await hint.click();

    await expect(page.getByText("Optional AI help")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Try thinking of the quarters as slices of one cake."),
    ).toBeVisible();

    // The authored hint is still there. It is the one that counts, and the
    // rephrasing never replaces it.
    await expect(page.getByText(/Look at the bottom numbers first/)).toBeVisible();
  });

  test("a hint with no AI wording shows the authored hint and no error", async ({ page }) => {
    await page.route("**/activity-attempts/*/hints", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: CORS });
        return;
      }
      const response = await route.fetch();
      const body = await response.json();
      body.data.ai_hint = null;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: CORS,
        body: JSON.stringify(body),
      });
    });

    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");

    const hint = page.getByRole("button", { name: /Need a hint\?/ });
    test.skip(!(await present(hint, 5_000)), "this question offers no hint");
    await hint.click();

    await expect(page.getByText(/Look at the bottom numbers first/)).toBeVisible({
      timeout: 15_000,
    });
    // Silence, not an apology: nothing failed, there is simply no rephrasing.
    await expect(page.getByText("Optional AI help")).toHaveCount(0);
    await expect(page.getByText(/did not arrive/)).toHaveCount(0);
  });

  test("a refused hint request still leaves the learner able to answer", async ({ page }) => {
    await stub(page, "**/activity-attempts/*/hints", {
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "service_unavailable", message: "unavailable", request_id: "stub" },
      }),
    });

    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");

    const hint = page.getByRole("button", { name: /Need a hint\?/ });
    test.skip(!(await present(hint, 5_000)), "this question offers no hint");
    await hint.click();

    // Says what to do next rather than only that something went wrong.
    await expect(page.getByText(/Check answer|ask again|try as many times/i).first()).toBeVisible({
      timeout: 15_000,
    });
    // And the question is still answerable.
    await expect(page.locator("button[aria-pressed]").first()).toBeVisible();
  });

  // ─── Activities: explaining a wrong answer in the player ─────────

  test("an enabled player explanation is labelled a suggestion", async ({ page }) => {
    await stub(page, "**/ai/incorrect-answer-explanation", {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(advisoryBody("explanation", "Add the top numbers only.")),
    });

    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");

    // Answer wrongly on purpose: there is nothing to explain about a correct
    // answer, and the panel is only offered after a wrong verdict.
    const wrong = page.locator("button[aria-pressed]").last();
    test.skip(!(await present(wrong, 5_000)), "this activity has no multiple-choice question");
    await wrong.click();

    const check = page.getByRole("button", { name: "Check answer" });
    test.skip(!(await present(check, 3_000)), "this answer was already checked");
    await check.click();

    await expect(page.getByText(/Not quite/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("AI suggestion", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Twice on purpose: once on screen, and once in the polite live region so
    // a screen-reader user hears it arrive. `exact` separates the visible
    // paragraph from the announcement, which prefixes it.
    await expect(page.getByText("Add the top numbers only.", { exact: true })).toBeVisible();
    await expect(page.getByText("Optional AI suggestion: Add the top numbers only.")).toBeAttached();
  });

  // ─── The summary is written once ─────────────────────────────────

  test("the summary is asked for once and survives a refresh", async ({ page }) => {
    let asked = 0;
    await page.route("**/ai/student-feedback", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: CORS });
        return;
      }
      asked += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: CORS,
        body: JSON.stringify(
          advisoryBody("feedback_text", `Summary number ${asked}. Keep going with fractions.`),
        ),
      });
    });

    test.skip(!(await openFinishedPaper(page)), "this learner has finished nothing yet");
    await expect(page.getByText("Summary number 1.")).toBeVisible({ timeout: 20_000 });
    expect(asked).toBe(1);

    // Reloading the report must not rewrite the advice. The same finished
    // paper producing different wording each visit makes a deterministic
    // result look unsettled, and spends a request saying the same thing.
    await page.reload();
    await expect(page.getByText("Summary number 1.")).toBeVisible({ timeout: 20_000 });
    expect(asked, "the summary was regenerated on refresh").toBe(1);
  });

  test("the summary offers no refresh control", async ({ page }) => {
    await stub(page, "**/ai/student-feedback", {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(advisoryBody("feedback_text", "Steady work on fractions.")),
    });

    test.skip(!(await openFinishedPaper(page)), "this learner has finished nothing yet");
    await expect(page.getByText("Steady work on fractions.")).toBeVisible({ timeout: 20_000 });

    // Regenerating was the only thing these did, and regenerating is exactly
    // what this screen no longer does.
    await expect(page.getByRole("button", { name: /Refresh/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Retry$/i })).toHaveCount(0);
  });
});
