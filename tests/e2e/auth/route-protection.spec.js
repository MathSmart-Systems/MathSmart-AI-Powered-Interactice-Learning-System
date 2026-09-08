import { expect, test } from "@playwright/test";

import { STUDENT_ROUTES, TEACHER_ADMIN_ROUTES } from "../support/accounts";

test.describe("unauthenticated route protection", () => {
  test("the root route sends visitors to the login page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  for (const route of STUDENT_ROUTES) {
    test(`${route} redirects to the login page`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    });
  }

  for (const route of TEACHER_ADMIN_ROUTES) {
    test(`${route} redirects to the login page`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    });
  }
});
