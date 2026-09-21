import { expect, test } from "@playwright/test";

import {
  TEACHER_ADMIN_ACCOUNT,
  TEACHER_ADMIN_NAV_LABELS,
  TEACHER_ADMIN_ROUTES,
  hasAccount,
  signIn,
} from "../support/accounts";

const describe = hasAccount(TEACHER_ADMIN_ACCOUNT) ? test.describe : test.describe.skip;

/**
 * Every Teacher/Administrator destination now has a workspace of its own, each
 * covered by its own specification. The list of placeholders is empty, and
 * what is worth asserting is that it stays empty.
 */

describe("teacher/administrator workspace", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/dashboard");
  });

  test("signing in lands on the Teacher/Administrator dashboard", async ({ page }) => {
    await expect(page).toHaveURL(/\/teacher\/dashboard$/);
    await expect(page.getByText("Teacher/Administrator workspace").first()).toBeVisible();
  });

  test("the sidebar lists every Teacher/Administrator destination", async ({ page }) => {
    const links = page.getByRole("navigation", { name: "Workspace" }).getByRole("link");
    await expect(links).toHaveText(TEACHER_ADMIN_NAV_LABELS);
  });

  test("no destination is still a placeholder", async ({ page }) => {
    for (const route of TEACHER_ADMIN_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await expect(page.getByRole("heading", { name: "UI in progress" })).toHaveCount(0);
    }
  });

  test("the class sections destination renders its live workspace", async ({ page }) => {
    await page.goto("/teacher/grades-sections");
    await expect(page).toHaveURL(/\/teacher\/grades-sections$/);
    await expect(page.getByRole("heading", { name: "UI in progress" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Class Sections" })).toBeVisible();
  });

  test("the interventions destination renders the live dashboard", async ({ page }) => {
    await page.goto("/teacher/interventions");
    await expect(page).toHaveURL(/\/teacher\/interventions$/);
    await expect(page.getByRole("heading", { name: "UI in progress" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Teacher Intervention Dashboard" }),
    ).toBeVisible();
  });

  test("interventions stays usable on a narrow phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/teacher/interventions");

    await expect(
      page.getByRole("heading", { name: "Teacher Intervention Dashboard" }),
    ).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });

  test("navigation links move between destinations and mark the active one", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Workspace" });
    await nav.getByRole("link", { name: "Question Bank" }).click();

    await expect(page).toHaveURL(/\/teacher\/question-bank$/);
    await expect(nav.getByRole("link", { name: "Question Bank" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("a teacher_admin cannot open the Student workspace", async ({ page }) => {
    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/teacher\/dashboard$/);

    await page.goto("/student/progress");
    await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  });

  test("logging out ends access, including through the back button", async ({ page }) => {
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goBack();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/teacher/students");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the mobile drawer opens, navigates, and closes", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/teacher/dashboard");

    const trigger = page.getByRole("button", { name: "Open workspace menu" });
    await trigger.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Interventions" }).click();

    await expect(page).toHaveURL(/\/teacher\/interventions$/);
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
