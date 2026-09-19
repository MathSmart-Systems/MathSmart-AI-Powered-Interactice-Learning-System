import { expect, test } from "@playwright/test";

import { STUDENT_ACCOUNT, hasAccount, signIn } from "../support/accounts";
import {
  DIALOG_VIEWPORTS,
  expectDialogBehaviour,
  expectDialogFits,
} from "../support/dialogs";

/**
 * Responsive cover for the Student dialogs.
 *
 * The learner workspace has one dialog, and it is built from the same shared
 * primitive the Teacher/Administrator dialogs use. Checking it here is what
 * proves a change to that primitive was judged against both roles rather than
 * against the workspace that happened to be open at the time.
 */

const describe = hasAccount(STUDENT_ACCOUNT) ? test.describe : test.describe.skip;

async function openEditName(page) {
  await page.goto("/student/profile");
  const trigger = page.getByRole("button", { name: "Edit name", exact: true });
  await expect(trigger).toBeVisible();

  // How wide the page is before the dialog exists, so the dialog is only
  // blamed for what it actually adds.
  const baselineScrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );

  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  return { trigger, baselineScrollWidth };
}

describe("student dialogs at every width", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL("**/student/dashboard");
  });

  test("the name dialog fits every viewport", async ({ page }) => {
    test.setTimeout(90_000);

    for (const viewport of DIALOG_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { baselineScrollWidth } = await openEditName(page);
      await expectDialogFits(page, viewport, { baselineScrollWidth });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
    }
  });

  test("the name dialog keeps its keyboard behaviour on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const { trigger } = await openEditName(page);

    await expectDialogBehaviour(page, trigger);
  });

  test("the name field keeps room to type on the narrowest phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openEditName(page);

    const field = page.getByLabel("Full name");
    await expect(field).toBeVisible();

    const box = await field.boundingBox();
    // The field sits inside the dialog's own padding, not against its edge.
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(304);
  });
});
