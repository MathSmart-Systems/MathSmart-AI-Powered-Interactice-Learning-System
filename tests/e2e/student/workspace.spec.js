import { expect, test } from "@playwright/test";

import {
  STUDENT_ACCOUNT,
  STUDENT_NAV_LABELS,
  STUDENT_ROUTES,
  hasAccount,
  signIn,
} from "../support/accounts";

const describe = hasAccount(STUDENT_ACCOUNT) ? test.describe : test.describe.skip;

describe("student workspace", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL("**/student/dashboard");
  });

  test("signing in lands on the student dashboard", async ({ page }) => {
    await expect(page).toHaveURL(/\/student\/dashboard$/);
    await expect(page.getByText("Student workspace").first()).toBeVisible();
    await expect(page.getByText("Grade 6 learning").first()).toBeVisible();
  });

  test("the sidebar lists exactly the student destinations", async ({ page }) => {
    const links = page.getByRole("navigation", { name: "Workspace" }).getByRole("link");
    await expect(links).toHaveText(STUDENT_NAV_LABELS);
  });

  test("every destination opens its own UI-in-progress page", async ({ page }) => {
    for (const route of STUDENT_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await expect(page.getByRole("heading", { name: "UI in progress" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { current: "page" })).toHaveCount(1);
    }
  });

  test("navigation links move between destinations and mark the active one", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Workspace" });
    await nav.getByRole("link", { name: "Assessments" }).click();

    await expect(page).toHaveURL(/\/student\/assessments$/);
    await expect(nav.getByRole("link", { name: "Assessments" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("a student cannot open the Teacher/Administrator workspace", async ({ page }) => {
    await page.goto("/teacher/dashboard");
    await expect(page).toHaveURL(/\/student\/dashboard$/);

    await page.goto("/teacher/reports-analytics");
    await expect(page).toHaveURL(/\/student\/dashboard$/);
  });

  test("logging out ends access, including through the back button", async ({ page }) => {
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the mobile drawer opens, navigates, and closes", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/student/dashboard");

    const trigger = page.getByRole("button", { name: "Open workspace menu" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByRole("dialog").getByRole("link", { name: "Progress" }).click();
    await expect(page).toHaveURL(/\/student\/progress$/);
    await expect(page.getByRole("dialog")).toBeHidden();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
