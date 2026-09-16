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
    const configurationMissing = await configurationWarning.isVisible();
    test.skip(
      configurationMissing && !process.env.CI,
      "The running app has no Supabase configuration.",
    );
    expect(
      configurationMissing,
      "Supabase configuration must be available when authentication tests run in CI.",
    ).toBe(false);

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

/**
 * The graph-paper panel on the right of the login page is an interactive
 * coordinate plane: a fixed goal point, a pointer-controlled plotted point that
 * snaps to the 24px ruling, and the segment between them — the gap.
 *
 * It is decoration, so every test here also guards the thing that matters more
 * than the effect: that the panel stays out of the accessibility tree, out of
 * the tab order, and out of the way of the form.
 */
const GRID = 24;

/** The panel only exists from the lg breakpoint up. */
async function plotBox(page) {
  const plot = page.getByTestId("gap-plot");
  await expect(plot).toBeAttached();
  const box = await plot.boundingBox();
  expect(box).not.toBeNull();
  return { plot, box };
}

async function readPoint(plot) {
  return {
    x: Number(await plot.getAttribute("data-plot-x")),
    y: Number(await plot.getAttribute("data-plot-y")),
    state: await plot.getAttribute("data-plot-state"),
  };
}

test.describe("login background: the gap segment", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login");
    await expect(page.locator("form[data-hydrated='true']")).toBeAttached();
  });

  test("the panel stays decorative: hidden from assistive tech, empty of focus stops", async ({
    page,
  }) => {
    const panel = page.getByTestId("login-panel");
    await expect(panel).toHaveAttribute("aria-hidden", "true");

    const focusable = panel.locator(
      "a, button, input, select, textarea, [tabindex], [contenteditable]",
    );
    expect(await focusable.count()).toBe(0);
  });

  test("the goal point sits on a ruling intersection", async ({ page }) => {
    const { plot } = await plotBox(page);

    const goalX = Number(await plot.getAttribute("data-goal-x"));
    const goalY = Number(await plot.getAttribute("data-goal-y"));

    expect(goalX).toBeGreaterThan(0);
    expect(goalY).toBeGreaterThan(0);
    expect(goalX % GRID).toBe(0);
    expect(goalY % GRID).toBe(0);
  });

  test("moving the pointer plots a point, snapped to the 24px ruling", async ({ page }) => {
    const { plot, box } = await plotBox(page);
    const before = await readPoint(plot);
    expect(before.state).toBe("rest");

    // A deliberately off-grid target: the point must land on the ruling anyway.
    await page.mouse.move(box.x + 197, box.y + 143);
    await expect(plot).toHaveAttribute("data-plot-state", "tracking");

    const after = await readPoint(plot);
    expect(after).not.toEqual(before);
    expect(after.x % GRID).toBe(0);
    expect(after.y % GRID).toBe(0);
  });

  test("reaching the goal closes the gap", async ({ page }) => {
    const { plot, box } = await plotBox(page);

    const goalX = Number(await plot.getAttribute("data-goal-x"));
    const goalY = Number(await plot.getAttribute("data-goal-y"));
    await page.mouse.move(box.x + goalX, box.y + goalY);

    await expect(plot).toHaveAttribute("data-plot-state", "closed");
  });

  test("moving focus into a field settles the background back to rest", async ({
    page,
  }) => {
    const { plot, box } = await plotBox(page);
    const rest = await readPoint(plot);

    await page.mouse.move(box.x + 197, box.y + 143);
    await expect(plot).toHaveAttribute("data-plot-state", "tracking");

    // The email field is already focused on load, so focus has to actually move
    // for a focus event to exist at all.
    await page.getByLabel("Password").focus();
    await expect(plot).toHaveAttribute("data-plot-state", "rest");

    const settled = await readPoint(plot);
    expect(settled.x).toBe(rest.x);
    expect(settled.y).toBe(rest.y);
  });

  test("typing settles the background even when focus never moves", async ({ page }) => {
    const { plot, box } = await plotBox(page);

    // Email is autofocused, so a learner can start typing without ever firing a
    // focus event. Nobody should have to type against a moving background.
    await page.mouse.move(box.x + 197, box.y + 143);
    await expect(plot).toHaveAttribute("data-plot-state", "tracking");

    await page.keyboard.type("learner@example.test");
    await expect(plot).toHaveAttribute("data-plot-state", "rest");
    await expect(page.getByLabel("Email address")).toHaveValue("learner@example.test");
  });

  test("the plotted point returns to rest when the pointer leaves the panel", async ({
    page,
  }) => {
    const { plot, box } = await plotBox(page);

    await page.mouse.move(box.x + 197, box.y + 143);
    await expect(plot).toHaveAttribute("data-plot-state", "tracking");

    await page.mouse.move(box.x - 200, box.y + 143);
    await expect(plot).toHaveAttribute("data-plot-state", "rest");
  });

  test("clicking the panel marks the point once and submits nothing", async ({ page }) => {
    const { plot, box } = await plotBox(page);

    await page.mouse.click(box.x + 197, box.y + 143);
    await expect(plot).toHaveAttribute("data-plot-mark", "on");

    await expect(plot).toHaveAttribute("data-plot-mark", "off", { timeout: 2000 });
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel("Email address")).toHaveValue("");
  });

  test("driving the panel logs nothing to the console", async ({ page }) => {
    const problems = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        problems.push(message.text());
      }
    });
    page.on("pageerror", (error) => problems.push(String(error)));

    await page.goto("/login");
    await expect(page.locator("form[data-hydrated='true']")).toBeAttached();

    const { box } = await plotBox(page);
    for (const offset of [40, 120, 200, 280]) {
      await page.mouse.move(box.x + offset, box.y + offset);
    }
    await page.mouse.click(box.x + 200, box.y + 200);
    await page.mouse.move(box.x - 200, box.y + 200);

    expect(problems).toEqual([]);
  });

  test("the form keeps its own focus ring and tab order", async ({ page }) => {
    await page.getByLabel("Email address").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password")).toBeFocused();
  });
});

test.describe("login background: reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the panel is a still image and the pointer does not move the point", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login");
    await expect(page.locator("form[data-hydrated='true']")).toBeAttached();

    const { plot, box } = await plotBox(page);
    await expect(plot).toHaveAttribute("data-plot-motion", "reduced");

    const before = await readPoint(plot);
    await page.mouse.move(box.x + 197, box.y + 143);
    await page.waitForTimeout(500);

    const after = await readPoint(plot);
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.state).toBe("rest");
  });
});

test.describe("login background: narrow viewports", () => {
  for (const width of [360, 768]) {
    test(`the panel is not rendered at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/login");
      await expect(page.locator("form[data-hydrated='true']")).toBeAttached();

      // The panel is in the markup but display:none below lg, so "attached but
      // not visible" is the real assertion — `toBeHidden` alone would also pass
      // if the panel had simply never been built.
      const plot = page.getByTestId("gap-plot");
      await expect(plot).toBeAttached();
      await expect(plot).toBeHidden();
      await expect(plot).toHaveAttribute("data-plot-state", "rest");
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    });
  }
});
