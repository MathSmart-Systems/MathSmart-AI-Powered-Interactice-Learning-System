import { expect, test } from "@playwright/test";

test.describe("login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    // The password control and the submit state need React, so wait for the
    // form to report that it is hydrated before driving it.
    await expect(page.locator("form[data-hydrated='true']")).toBeAttached();
  });

  test("both fields have accessible names and autocomplete values", async ({ page }) => {
    const email = page.getByLabel("Email address");
    const password = page.getByLabel("Password");

    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(email).toHaveAttribute("autocomplete", "email");
    await expect(password).toHaveAttribute("autocomplete", "current-password");
    await expect(password).toHaveAttribute("type", "password");
  });

  test("submitting an empty form is blocked by required validation", async ({ page }) => {
    await page.getByRole("button", { name: "Sign in" }).click();

    const emailValid = await page
      .getByLabel("Email address")
      .evaluate((element) => element.checkValidity());

    expect(emailValid).toBe(false);
    await expect(page).toHaveURL(/\/login/);
  });

  test("the password visibility control reveals and hides the password", async ({ page }) => {
    const password = page.getByLabel("Password");
    await password.fill("a-value-only-this-test-knows");

    const show = page.getByRole("button", { name: "Show password" });
    await expect(show).toHaveAttribute("aria-pressed", "false");
    await show.click();

    await expect(password).toHaveAttribute("type", "text");
    const hide = page.getByRole("button", { name: "Hide password" });
    await expect(hide).toHaveAttribute("aria-pressed", "true");

    await hide.click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("the form can be completed with the keyboard alone", async ({ page }) => {
    await page.getByLabel("Email address").focus();
    await page.keyboard.type("keyboard@example.test");
    await page.keyboard.press("Tab");
    await page.keyboard.type("keyboard-password");
    await page.keyboard.press("Tab");

    await expect(page.getByRole("button", { name: "Show password" })).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
  });

  for (const width of [360, 768, 1024, 1440]) {
    test(`the page fits a ${width}px viewport without horizontal scrolling`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/login");
      await expect(page.locator("form[data-hydrated='true']")).toBeAttached();

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );

      expect(overflows).toBe(false);
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    });
  }

  test("rejected credentials produce a generic message", async ({ page }) => {
    // The running app is the source of truth for whether Supabase is wired up.
    const configurationWarning = page.getByText("not connected to its sign-in service");
    test.skip(
      await configurationWarning.isVisible(),
      "The running app has no Supabase configuration.",
    );

    await page.getByLabel("Email address").fill(`no-such-user-${Date.now()}@example.invalid`);
    await page.getByLabel("Password").fill("not-a-real-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = page.getByTestId("login-error");
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await expect(alert).toContainText(/do not match|cannot reach/i);
    await expect(alert).not.toContainText(/user|email address is|not found/i);
    await expect(page).toHaveURL(/\/login/);
  });
});
