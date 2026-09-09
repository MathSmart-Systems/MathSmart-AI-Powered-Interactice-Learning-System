import { expect, test } from "@playwright/test";

import {
  TEACHER_ADMIN_ACCOUNT,
  TEACHER_ADMIN_NAV_LABELS,
  TEACHER_ADMIN_ROUTES,
  hasAccount,
  signIn,
} from "../support/accounts";

const describe = hasAccount(TEACHER_ADMIN_ACCOUNT) ? test.describe : test.describe.skip;

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

  test("every destination opens its own UI-in-progress page", async ({ page }) => {
    for (const route of TEACHER_ADMIN_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await expect(page.getByRole("heading", { name: "UI in progress" })).toBeVisible();
    }
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
