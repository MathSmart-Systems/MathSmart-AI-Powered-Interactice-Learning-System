import { expect, test } from "@playwright/test";

import {
  STUDENT_ACCOUNT,
  STUDENT_ROUTES,
  hasAccount,
  signIn,
} from "../support/accounts";

/**
 * Browser coverage for the learner dashboard.
 *
 * The suite signs in as the configured learner and reads whatever the MathSmart
 * API says about them. It therefore asserts the things that hold for any
 * learner — the dominant action exists and leads somewhere real, every status
 * is written out, the layout survives a phone — and never a particular score,
 * which would pin the test to one seeded record.
 *
 * When the API is not running, the dashboard is expected to render its
 * documented recoverable failure instead, and that is checked too.
 */

const describe = hasAccount(STUDENT_ACCOUNT) ? test.describe : test.describe.skip;

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

/** Every destination the dashboard is allowed to link to. */
const VALID_ROUTES = new Set(STUDENT_ROUTES);

/** The wording the dashboard is allowed to use for a diagnostic. */
const DIAGNOSTIC_LABELS = ["Not started", "In progress", "Completed", "Not available"];

/** The call to action of each state the dominant panel can be in. */
const NEXT_ACTION_LABELS = [
  "Start the diagnostic",
  "Finish the diagnostic",
  "Start this module",
  "Continue this module",
  "Review this module",
  "Open this module",
  "Look at my progress",
  "Browse My Learning",
];

/**
 * The dashboard is streamed into a Suspense boundary, so the loading shape is
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

describe("student dashboard", () => {
  let apiUp = false;

  test.beforeAll(async ({ request }) => {
    apiUp = await apiIsReachable(request);
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL("**/student/dashboard");
    await settled(page);
  });

  test("the dashboard replaces the placeholder for a signed-in learner", async ({
    page,
  }) => {
    await expect(page.getByRole("heading", { name: "UI in progress" })).toHaveCount(0);

    const headings = page.getByRole("heading", { level: 1 });
    await expect(headings).toHaveCount(1);
    await expect(headings.first()).toBeVisible();
  });

  test("a recoverable failure is usable when the service cannot be reached", async ({
    page,
  }) => {
    test.skip(apiUp, "The MathSmart API is running, so this state does not apply.");

    await expect(
      page.getByRole("heading", { name: "Your progress could not be loaded" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to My Learning" })).toBeVisible();
  });

  test("the greeting names the learner's own workspace", async ({ page }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Good (morning|afternoon|evening)/,
    );
    await expect(page.getByText("Grade 6 mathematics").first()).toBeVisible();
  });

  test("the diagnostic status is written out, not only coloured", async ({ page }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    const status = page.locator("p").filter({ hasText: /Diagnostic status/ }).first();
    await expect(status).toBeVisible();
    await expect(status).toHaveText(
      new RegExp(`Diagnostic status\\s*(${DIAGNOSTIC_LABELS.join("|")})`),
    );
  });

  test("one dominant next action is offered, and it leads to a real route", async ({
    page,
  }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    const cta = page.getByRole("link", { name: new RegExp(NEXT_ACTION_LABELS.join("|")) });
    await expect(cta).toHaveCount(1);

    const href = await cta.getAttribute("href");
    expect(VALID_ROUTES.has(href)).toBe(true);

    await cta.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test("every dashboard link points at a route that exists", async ({ page }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    const hrefs = await page.locator("#workspace-content a[href]").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );

    expect(hrefs.length).toBeGreaterThan(0);

    for (const href of hrefs) {
      expect(VALID_ROUTES.has(href), `${href} is not a student route`).toBe(true);
    }
  });

  test("the sections a learner needs are all present", async ({ page }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    for (const title of [
      "How you are improving",
      "Your learning path",
      "Competency progress",
      "Recently finished",
    ]) {
      await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
    }
  });

  test("progress figures are readable as text, not only as a drawing", async ({
    page,
  }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    for (const term of ["Diagnostic score", "Overall mastery now", "Growth since then"]) {
      await expect(page.getByText(term, { exact: true })).toBeVisible();
    }

    // The plot itself is hidden from assistive technology precisely because the
    // figures above repeat every value it draws.
    await expect(page.locator("#workspace-content svg[aria-hidden='true']").first()).toBeAttached();
  });

  test("the next action can be reached and used from the keyboard", async ({ page }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    const cta = page.getByRole("link", { name: new RegExp(NEXT_ACTION_LABELS.join("|")) });
    const href = await cta.getAttribute("href");

    await page.locator("body").click({ position: { x: 2, y: 2 } });

    let reached = false;
    for (let step = 0; step < 30 && !reached; step += 1) {
      await page.keyboard.press("Tab");
      reached = await cta.evaluate((node) => node === document.activeElement);
    }

    expect(reached, "the next action was not reachable by tabbing").toBe(true);

    const outlineWidth = await cta.evaluate(
      (node) => getComputedStyle(node).outlineWidth,
    );
    expect(outlineWidth).not.toBe("0px");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test("the dashboard fits a phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/student/dashboard");
    await settled(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("the dashboard fits a tablet without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/student/dashboard");
    await settled(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("a section with nothing to list says what would appear there", async ({ page }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");

    // Whichever sections are empty for this learner, none of them may be blank:
    // each either lists rows or explains what puts rows there.
    for (const [heading, emptyText] of [
      ["Your learning path", /No modules are on your path yet|could not be loaded/],
      ["Competency progress", /No competency scores have been recorded yet/],
      ["Recently finished", /Nothing has been marked yet/],
    ]) {
      const section = page.locator("section").filter({
        has: page.getByRole("heading", { name: heading, level: 2 }),
      });

      const rows = section.getByRole("listitem");
      const rowCount = await rows.count();

      if (rowCount === 0) {
        await expect(section.getByText(emptyText)).toBeVisible();
      } else {
        expect(rowCount).toBeGreaterThan(0);
      }
    }
  });
});
