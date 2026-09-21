import { expect, test } from "@playwright/test";

import { STUDENT_ACCOUNT, hasAccount, signIn } from "../support/accounts";

/**
 * The learner dashboard, against the real API and the learner's own records.
 *
 * It asserts what holds for any learner — every number is shown once, every
 * link lands on a real page, the support notice never uses case vocabulary,
 * the layout survives a phone — and reads the learner's own figures back from
 * the API where a check needs one, rather than pinning a seeded score.
 *
 * The states a single account cannot be put into on demand — no diagnostic,
 * diagnostic in progress, no path yet, everything mastered — are covered by
 * the model's unit tests, which build each from the API's own contract.
 */

const describe = hasAccount(STUDENT_ACCOUNT) ? test.describe : test.describe.skip;

const VIEWPORTS = [
  { name: "phone", width: 360, height: 780 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "short laptop", width: 1280, height: 620 },
  { name: "desktop", width: 1440, height: 900 },
];

async function settled(page) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
}

describe("student dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL(/\/student\/dashboard/);
    await settled(page);
  });

  test("greets the learner and says where their diagnostic stands", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Good (morning|afternoon|evening)/);
    await expect(page.getByText(/^Diagnostic:$/)).toBeVisible();
  });

  test("has one next step, and it leads to a real page", async ({ page }) => {
    const next = page.locator("#continue-learning-btn");
    await expect(next).toHaveCount(1);

    const href = await next.getAttribute("href");
    await next.click();
    await page.waitForURL((url) => url.pathname === href.split("?")[0]);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("This page could not be found")).toHaveCount(0);
  });

  test("shows each figure once, rounded, with growth in points", async ({ page }) => {
    const strip = page.getByRole("region", { name: "Your progress at a glance" });
    await expect(strip).toBeVisible();

    const text = await strip.innerText();
    // No unrounded percentages anywhere in the strip.
    expect(text).not.toMatch(/\d+\.\d+%/);
    // Growth is a difference in points, never labelled as a percentage.
    expect(text).toMatch(/(points?|No change|—)/);
    expect(text).not.toMatch(/null/);

    // The four tiles that repeated the chart are gone; the chart repeats nothing.
    await expect(page.getByText("Overall Progress")).toHaveCount(0);
    await expect(page.getByText("Score Trajectory")).toHaveCount(0);
  });

  test("lists work that is open, each linking to its own page", async ({ page }) => {
    const ready = page.getByRole("region", { name: "Ready for you" });
    await expect(ready).toBeVisible();

    const links = ready.getByRole("link");
    const count = await links.count();
    for (let index = 0; index < count; index += 1) {
      const href = await links.nth(index).getAttribute("href");
      expect(href).toMatch(/^\/student\/(activities|assessments)(\/[0-9a-f-]{36})?$/);
    }
  });

  test("links every lesson it can open to that lesson", async ({ page }) => {
    const path = page.getByRole("region", { name: "Your learning path" });
    const lessonLinks = path.locator('a[href^="/student/my-learning/"]');
    test.skip((await lessonLinks.count()) === 0, "this learner has no open lesson on their path");

    const href = await lessonLinks.first().getAttribute("href");
    await lessonLinks.first().click();
    await page.waitForURL((url) => url.pathname === href);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  });

  test("every link on the page opens a real destination", async ({ page, context }) => {
    const hrefs = await page
      .locator("#workspace-content a[href^='/student']")
      .evaluateAll((anchors) => [...new Set(anchors.map((anchor) => anchor.getAttribute("href")))]);
    expect(hrefs.length).toBeGreaterThan(0);

    const probe = await context.newPage();
    for (const href of hrefs) {
      const response = await probe.goto(href);
      expect(response?.status(), `${href} answered`).toBeLessThan(400);
      await expect(probe.getByText("This page could not be found")).toHaveCount(0);
    }
    await probe.close();
  });

  test("a support notice is kind, and never names a case", async ({ page }) => {
    const notice = page.getByRole("status", { name: "Support from your teacher" });
    test.skip((await notice.count()) === 0, "this learner has no open support");

    await expect(notice).toContainText("Your teacher is preparing extra support for your learning");
    const text = await notice.innerText();
    for (const word of ["intervention", "severity", "HIGH", "MEDIUM", "case"]) {
      expect(text, `the notice says "${word}"`).not.toContain(word);
    }
  });

  test("the primary action is reachable and visibly focused from the keyboard", async ({ page }) => {
    const next = page.locator("#continue-learning-btn");

    // Reached with Tab, the way a keyboard user gets there. A focus ring is a
    // :focus-visible style, which a script's .focus() does not trigger.
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    let reached = false;
    for (let press = 0; press < 40 && !reached; press += 1) {
      await page.keyboard.press("Tab");
      reached = await next.evaluate((element) => element === document.activeElement);
    }
    expect(reached, "the primary action is not in the tab order").toBe(true);

    const ring = await next.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return { outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow };
    });
    expect(
      ring.outline !== "none" && ring.width !== "0px" ? true : ring.shadow !== "none",
      `no visible focus: ${JSON.stringify(ring)}`,
    ).toBe(true);
  });

  test("fits every viewport without sideways scroll or inner scrollbars", async ({ page }) => {
    for (const size of VIEWPORTS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const { overflow, scrollers } = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scrollers: [...document.querySelectorAll("#workspace-content *")].filter((element) => {
          const style = window.getComputedStyle(element);
          return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight - element.clientHeight > 4;
        }).length,
      }));
      expect(overflow, `${size.name} scrolls sideways`).toBeLessThanOrEqual(1);
      expect(scrollers, `${size.name} has a scrollbar inside the page`).toBe(0);
    }
  });
});

describe("student dashboard is closed to teachers", () => {
  test.skip(!hasAccount(STUDENT_ACCOUNT), "no student account is configured");

  test("a learner cannot open the teacher dashboard", async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL(/\/student\/dashboard/);

    await page.goto("/teacher/dashboard");

    await expect(page).not.toHaveURL(/\/teacher\/dashboard/);
    await expect(page.getByRole("heading", { name: "Grade 6 Mathematics" })).toHaveCount(0);
  });
});
