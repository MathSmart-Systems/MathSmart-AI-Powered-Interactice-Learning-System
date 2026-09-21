import { expect, test } from "@playwright/test";

import { STUDENT_ACCOUNT, hasAccount, signIn } from "../support/accounts.js";
import { present } from "../support/student-place.js";

/**
 * Every student screen reserves its own shape while it loads, once.
 *
 * Two different faults are checked here, and they pull in opposite
 * directions. A screen with no skeleton grows by several columns the moment
 * its data lands, shoving the page under whoever is reading it. A screen that
 * shows its skeleton again for an ordinary click throws away content the
 * learner was already looking at. The rule is the same one either way: the
 * full shape belongs to the first load and to nothing else.
 *
 * The fallback is asserted against the streamed document rather than by
 * racing the browser for it. React streams the Suspense fallback first, so it
 * is in the very first bytes of the response — which makes this deterministic
 * instead of a poll that skips itself whenever the server happens to be warm.
 */

test.describe.configure({ mode: "serial" });

const { describe, beforeEach } = test;

/** Every student screen that owns a first-load skeleton, and how to know it. */
const SCREENS = [
  {
    name: "Dashboard",
    path: "/student/dashboard",
    announces: "Loading your dashboard",
    heading: /^Good (morning|afternoon|evening)/,
  },
  {
    name: "Assessments",
    path: "/student/assessments",
    announces: "Loading your assessments",
    heading: "Assessments",
  },
  {
    name: "My Learning",
    path: "/student/my-learning",
    announces: "Loading your lessons",
    heading: "My Learning",
  },
  {
    name: "Activities",
    path: "/student/activities",
    announces: "Loading your activities",
    heading: "Activities",
  },
  {
    name: "Progress",
    path: "/student/progress",
    announces: "Loading your progress",
    heading: "My Mathematics Competency Progress",
  },
];

/** How many placeholder blocks a shape-matching skeleton is expected to hold. */
const ENOUGH_BLOCKS = 4;

describe("first-load skeletons", () => {
  test.skip(!hasAccount(STUDENT_ACCOUNT), "no student account is configured");

  beforeEach(async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL(/\/student\/dashboard/);
  });

  for (const screen of SCREENS) {
    test(`${screen.name} streams a layout-matching skeleton`, async ({ page }) => {
      const response = await page.request.get(screen.path);
      expect(response.status()).toBe(200);
      const html = await response.text();

      // It announces itself, so the page is not silent while it loads.
      expect(html, `${screen.name} does not announce its loading state`).toContain(
        screen.announces,
      );

      // And it reserves real space rather than printing one line of text.
      const blocks = (html.match(/animate-pulse/g) ?? []).length;
      expect(
        blocks,
        `${screen.name} reserves only ${blocks} placeholder blocks`,
      ).toBeGreaterThanOrEqual(ENOUGH_BLOCKS);
    });
  }

  test("the assessment player streams its own shape, not a bare spinner", async ({ page }) => {
    // The player is a client component, but it still renders on the server
    // with nothing loaded yet — which is exactly the state this covers.
    const response = await page.request.get("/student/assessments/diagnostic");
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html).toContain("Loading your assessment");
    expect((html.match(/animate-pulse/g) ?? []).length).toBeGreaterThanOrEqual(ENOUGH_BLOCKS);
  });

  for (const screen of SCREENS) {
    test(`${screen.name} settles into real content`, async ({ page }) => {
      await page.goto(screen.path);

      // The screen's own heading, not merely "a heading". An earlier version
      // of this accepted any `h1` and so passed while the page was showing
      // "Unable to Load Progress" — which is a heading, and is not the page
      // settling into its content.
      await expect(
        page.getByRole("heading", { name: screen.heading, level: 1 }),
      ).toBeVisible({ timeout: 25_000 });

      // The shape is handed over, not left behind.
      await expect(page.locator(".animate-pulse")).toHaveCount(0);
      await expect(page.getByText(screen.announces)).toHaveCount(0);
    });
  }

  test("opening the answer review never brings the skeleton back", async ({ page }) => {
    await page.goto("/student/assessments");
    const finished = page
      .locator('section[aria-labelledby="available-assessments-heading"]')
      .locator("ul > li")
      .filter({ hasText: "Finished" })
      .first();
    test.skip(!(await present(finished, 5_000)), "this learner has finished nothing yet");

    await finished.getByRole("link").first().click();
    const review = page.getByRole("button", { name: /Review my answers/ });
    await expect(review).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".animate-pulse")).toHaveCount(0);

    await review.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // The review fetches, and while it does the report stays put: a small
    // contextual line, never the page's own shape again. The heading behind
    // the dialog is hidden from assistive technology by design, so the dialog
    // itself is what is asserted to be on screen.
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Answer review" }),
    ).toBeVisible();
  });

  test("answering inside an activity never brings the skeleton back", async ({ page }) => {
    await page.goto("/student/activities");
    const open = page
      .locator("ul > li")
      .filter({ hasNot: page.getByText("Opens later") })
      .filter({ has: page.getByRole("link") })
      .filter({ hasText: /practice/i })
      .first();
    test.skip(!(await present(open, 5_000)), "no activity is open to this learner");

    await open.getByRole("link").first().click();
    await page.getByText(/Question \d+/).first().waitFor({ timeout: 20_000 });
    await expect(page.locator(".animate-pulse")).toHaveCount(0);

    const option = page.locator("button[aria-pressed]").first();
    test.skip(!(await present(option, 5_000)), "this activity has no multiple-choice question");
    await option.click();

    const check = page.getByRole("button", { name: "Check answer" });
    if (await present(check, 3_000)) {
      await check.click();
      await page.getByText(/Correct|Not quite/).first().waitFor({ timeout: 15_000 });
    }

    await expect(page.locator(".animate-pulse")).toHaveCount(0);
  });

  test("switching a progress tab never brings the skeleton back", async ({ page }) => {
    await page.goto("/student/progress");
    await expect(
      page.getByRole("heading", { name: "My Mathematics Competency Progress", level: 1 }),
    ).toBeVisible({ timeout: 25_000 });

    const tab = page.getByRole("tab").nth(1);
    test.skip(!(await present(tab, 5_000)), "the history tabs are not rendered");

    await tab.click();
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
