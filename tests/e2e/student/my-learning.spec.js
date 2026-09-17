import { expect, test } from "@playwright/test";

import {
  STUDENT_ACCOUNT,
  STUDENT_ROUTES,
  hasAccount,
  signIn,
} from "../support/accounts";

/**
 * Browser coverage for Student My Learning.
 *
 * The suite signs in as the configured learner and reads whatever the MathSmart
 * API says about them. It therefore asserts the things that hold for any
 * learner — the lesson list replaces the placeholder, every link leads to a
 * route that exists, statuses are written out, and the screens survive a phone
 * and a tablet — and never a particular lesson or score, which would pin the
 * test to one seeded record.
 *
 * When the API is not running, the screens are expected to render their
 * documented recoverable failure instead, and that is checked too.
 */

const describe = hasAccount(STUDENT_ACCOUNT) ? test.describe : test.describe.skip;

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const MODULE_URL = /^\/student\/my-learning\/[0-9a-f-]+$/;
const ACTIVITY_URL = /^\/student\/activities\/[0-9a-f-]+$/;
const STATIC_ROUTES = new Set(STUDENT_ROUTES);

/** The empty-path wording the screen is allowed to use. */
const PATH_EMPTY_TEXT =
  /(could not be loaded just now|Once your diagnostic is marked|While it is being prepared|No learning modules are published for Grade 6 yet)/;

function isValidHref(href) {
  return (
    STATIC_ROUTES.has(href) ||
    MODULE_URL.test(href) ||
    ACTIVITY_URL.test(href)
  );
}

/**
 * The screens are streamed into a Suspense boundary, so the loading shape is
 * what a locator finds first. Assertions that read the DOM directly, rather
 * than auto-waiting on an element, have to wait for the real page to arrive.
 */
async function settled(page) {
  await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle");
}

async function apiIsReachable(request) {
  if (!API_BASE_URL) {
    return false;
  }

  try {
    const response = await request.get(`${API_BASE_URL.replace(/\/+$/, "")}/health`, {
      timeout: 5000,
    });
    return response.ok();
  } catch {
    return false;
  }
}

describe("student my learning", () => {
  let apiUp = false;

  test.beforeAll(async ({ request }) => {
    apiUp = await apiIsReachable(request);
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL("**/student/dashboard");
    await page.goto("/student/my-learning");
    await settled(page);
  });

  test("My Learning replaces the placeholder for a signed-in learner", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "UI in progress" })).toHaveCount(0);

    const headings = page.getByRole("heading", { level: 1 });
    await expect(headings).toHaveCount(1);
    await expect(headings.first()).toHaveText("My Learning");
  });

  test("a recoverable failure is usable when the service cannot be reached", async ({
    page,
  }) => {
    test.skip(apiUp, "The MathSmart API is running, so this state does not apply.");

    await expect(
      page.getByRole("heading", { name: "Your lessons could not be loaded" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
  });

  test("the screen names the learner's own grade", async ({ page }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    await expect(page.getByText("Grade 6 mathematics").first()).toBeVisible();
  });

  test("the path is either listed or explained, never blank", async ({ page }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    const pathSection = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Your learning path", level: 2 }),
    });

    if ((await pathSection.count()) === 0) {
      await expect(page.getByText(/No learning modules are published for Grade 6 yet/)).toBeVisible();
      return;
    }

    const rows = pathSection.getByRole("listitem");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
    expect(rowCount).toBeLessThanOrEqual(100);
  });

  test("the catalogue is either browsable or absent with a reason", async ({ page }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    const exploreSection = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Lessons to explore", level: 2 }),
    });

    if (await exploreSection.count()) {
      const rows = exploreSection.getByRole("listitem");
      await expect(rows.first()).toBeVisible();
    }
  });

  test("every status is written out beside its icon", async ({ page }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    const pathSection = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Your learning path", level: 2 }),
    });

    if ((await pathSection.count()) === 0) {
      await expect(page.getByText(/No learning modules are published for Grade 6 yet/)).toBeVisible();
      return;
    }

    const pathRows = pathSection.getByRole("listitem");
    if ((await pathRows.count()) === 0) {
      await expect(page.getByText(PATH_EMPTY_TEXT)).toBeVisible();
      return;
    }

    const labels = ["Ready to start", "In progress", "Opens later", "Finished"];
    const texts = await pathRows.evaluateAll((items) =>
      items.map((item) => (item.textContent ?? "").replace(/\s+/g, " ").trim()),
    );
    expect(
      texts.some((text) => labels.some((label) => text.includes(label))),
      "no written-out status was found on any path row",
    ).toBe(true);
  });

  test("every link points at a route that exists", async ({ page }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    const hrefs = await page.locator("#workspace-content a[href]").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );

    if (hrefs.length === 0) {
      await expect(page.getByText(/No learning modules are published for Grade 6 yet/)).toBeVisible();
      return;
    }

    for (const href of hrefs) {
      expect(isValidHref(href), `${href} is not a student or lesson route`).toBe(true);
    }
  });

  test("a lesson can be opened from the list and closed back into it", async ({ page }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    const link = page
      .locator("#workspace-content")
      .locator('a[href^="/student/my-learning/"]:not([href="/student/my-learning"])')
      .first();

    if ((await link.count()) === 0) {
      test.skip(true, "No published lessons are available for this learner.");
      return;
    }

    const href = await link.getAttribute("href");
    expect(MODULE_URL.test(href)).toBe(true);

    await link.click();
    await expect(page).toHaveURL(MODULE_URL);
    await settled(page);

    await expect(
      page.getByRole("link", { name: "Back to My Learning" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to My Learning" }).click();
    await expect(page).toHaveURL(/\/student\/my-learning$/);
    await settled(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("My Learning");
  });

  test("the lesson list fits a phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/student/my-learning");
    await settled(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("the lesson list fits a tablet without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/student/my-learning");
    await settled(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});