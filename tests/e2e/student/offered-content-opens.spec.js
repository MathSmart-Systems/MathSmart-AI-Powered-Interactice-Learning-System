import { expect, test } from "@playwright/test";

import { STUDENT_ACCOUNT, hasAccount, signIn } from "../support/accounts.js";
import { hostedDataSkipReason, isLocalDataEnvironment } from "../support/environment.js";
import { present } from "../support/student-place.js";

/**
 * Anything a learner is offered has to open.
 *
 * This is the rule the workspace broke. Three activities were published
 * holding no questions and an assessment carried a question whose competency
 * was still a draft; every one of them was advertised with a live control, and
 * pressing it produced a server error for something no action of the learner's
 * had caused. Readiness is now decided by the server and carried on the row,
 * but a field is only worth what the interface does with it.
 *
 * So this walks the lists and presses everything on offer. It asserts no
 * particular content — it asserts the absence of a refusal, which is the one
 * thing an offered control must never produce.
 */

test.describe.configure({ mode: "serial" });

const { describe, beforeEach } = test;

/**
 * The headings that mean the learner hit a wall.
 *
 * Matched against the page's own heading rather than its whole text. A report
 * that opened perfectly well still says "AI assistance is currently
 * unavailable" when Groq is switched off, and reading the body caught that
 * sentence and called a working screen a refusal.
 */
const REFUSAL_HEADINGS = [
  /not ready yet/i,
  /could not be found/i,
  /unavailable/i,
  /Something went wrong/i,
  /not open (?:yet|to you)/i,
];

/** Asserts the screen a control led to is usable rather than a refusal. */
async function expectNoRefusal(page, where) {
  const heading = page.getByRole("heading", { level: 1 }).first();
  await heading.waitFor({ timeout: 20_000 });
  const title = await heading.innerText();

  for (const refusal of REFUSAL_HEADINGS) {
    expect(title, `${where} led to a refusal: "${title}"`).not.toMatch(refusal);
  }

  // The generic 500 is never acceptable anywhere, whatever the heading says.
  const body = await page.locator("main").innerText();
  expect(body, `${where} produced the generic server failure`).not.toContain(
    "The request could not be completed",
  );
}

describe("everything offered to a learner opens", () => {
  test.skip(!hasAccount(STUDENT_ACCOUNT), "no student account is configured");
  // Opening a paper or a practice writes an attempt against a real learner.
  test.skip(!isLocalDataEnvironment(), hostedDataSkipReason());

  beforeEach(async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL(/\/student\/dashboard/);
  });

  test("every activity offering a way in opens usable content", async ({ page }) => {
    await page.goto("/student/activities");
    await expect(page.getByRole("heading", { name: "Activities", level: 1 })).toBeVisible();

    const rows = page.locator("ul > li").filter({ hasText: /practice/i });
    const total = await rows.count();
    test.skip(total === 0, "no activities are published for this learner");

    // Collected up front: opening one navigates away, and the list is rebuilt
    // on the way back, so a live locator would go stale between visits.
    const offered = [];
    for (let index = 0; index < total; index += 1) {
      const row = rows.nth(index);
      const link = row.getByRole("link");
      if ((await link.count()) === 0) continue;
      offered.push({
        href: await link.first().getAttribute("href"),
        title: (await row.innerText()).split("\n")[0],
      });
    }

    test.skip(offered.length === 0, "nothing is open to this learner right now");

    for (const activity of offered) {
      await page.goto(activity.href);
      await expectNoRefusal(page, `the activity "${activity.title}"`);

      // And it is genuinely usable: a question to answer, or a finished
      // attempt to look at. An empty player is the failure this exists for.
      const usable = page
        .getByText(/Question \d+/)
        .or(page.getByRole("button", { name: /Try the Activity Again|Back to Activities/ }));
      await expect(usable.first(), `the activity "${activity.title}" opened empty`).toBeVisible({
        timeout: 20_000,
      });
    }
  });

  test("every assessment offering a way in opens usable content", async ({ page }) => {
    await page.goto("/student/assessments");
    await expect(page.getByRole("heading", { name: "Assessments", level: 1 })).toBeVisible();

    const rows = page
      .locator('section[aria-labelledby="available-assessments-heading"]')
      .locator("ul > li");
    const total = await rows.count();
    test.skip(total === 0, "no assessments are set for this learner");

    const offered = [];
    for (let index = 0; index < total; index += 1) {
      const row = rows.nth(index);
      const link = row.getByRole("link");
      if ((await link.count()) === 0) continue;
      offered.push({
        href: await link.first().getAttribute("href"),
        title: (await row.innerText()).split("\n").find((line) => line.trim()) ?? "",
      });
    }

    test.skip(offered.length === 0, "nothing is open to this learner right now");

    for (const paper of offered) {
      await page.goto(paper.href);
      await expectNoRefusal(page, `the assessment "${paper.title}"`);
    }
  });

  test("a card that cannot open offers no way in", async ({ page }) => {
    await page.goto("/student/assessments");

    const closed = page
      .locator('section[aria-labelledby="available-assessments-heading"]')
      .locator("ul > li")
      .filter({ hasText: /Not ready yet/ });
    test.skip(!(await present(closed, 3_000)), "nothing is unready for this learner");

    // Shown, because a learner should see what is coming — but not a door.
    await expect(closed.first().getByRole("link")).toHaveCount(0);
    await expect(closed.first()).not.toContainText("Ready to start");
  });

  test("an unready activity offers no way in either", async ({ page }) => {
    await page.goto("/student/activities");

    const closed = page.locator("ul > li").filter({ hasText: /Not ready yet/ });
    test.skip(!(await present(closed, 3_000)), "nothing is unready for this learner");

    await expect(closed.first().getByRole("link")).toHaveCount(0);
  });
});
