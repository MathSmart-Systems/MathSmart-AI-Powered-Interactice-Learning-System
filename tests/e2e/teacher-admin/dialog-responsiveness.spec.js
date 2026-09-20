import { expect, test } from "@playwright/test";

import { TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts";
import {
  DIALOG_VIEWPORTS,
  expectDialogBehaviour,
  expectDialogFits,
} from "../support/dialogs";

/**
 * Responsive cover for the Teacher/Administrator dialogs.
 *
 * Every dialog here is built from the shared primitive in
 * `src/components/ui/dialog.jsx`, so these are really tests of that one file —
 * the module-specific parts are the width cap and the content. The set below
 * is chosen to exercise what actually differs: a short form, a tall form that
 * has to scroll internally, a confirmation, and the competency dialogs, which
 * are the two that still build their own surface on Radix directly.
 */

const describe = hasAccount(TEACHER_ADMIN_ACCOUNT) ? test.describe : test.describe.skip;

/** Each case opens one dialog and says what it is there to prove. */
const DIALOGS = [
  {
    name: "a short form (Class Sections)",
    route: "/teacher/grades-sections",
    trigger: { role: "button", name: "Add section", exact: true },
    ready: { role: "heading", name: "Add Section" },
  },
  {
    name: "a tall form that has to scroll (Question Bank)",
    route: "/teacher/question-bank",
    trigger: { role: "button", name: "New question", exact: true },
    ready: { role: "heading", name: "New question" },
  },
  {
    name: "a tall form with nested editors (Learning Modules)",
    route: "/teacher/learning-modules",
    trigger: { role: "button", name: "New module", exact: true },
    ready: { role: "heading", name: "New module" },
  },
  {
    name: "an enrolment form (Students)",
    route: "/teacher/students",
    trigger: { role: "button", name: "Enroll student", exact: true },
    ready: { role: "heading", name: "Enroll Student" },
  },
  {
    // Built on Radix directly rather than on the shared primitive, so it is
    // the one that would drift if the two were ever fixed separately.
    name: "a dialog outside the shared primitive (Competencies)",
    route: "/teacher/competencies",
    trigger: { role: "button", name: "Add competency", exact: true },
    ready: { role: "heading", name: "New competency" },
  },
  {
    // The two authoring dialogs that were missing from this list entirely.
    // The question editors are wider still, but they can only be opened from a
    // row, and this specification is deliberately content-free — the
    // content-authoring run opens them against its own fixtures instead.
    name: "an authoring form (Activities)",
    route: "/teacher/activities",
    trigger: { role: "button", name: "Create activity", exact: true },
    ready: { role: "heading", name: "Create new practice activity" },
  },
  {
    name: "an authoring form (Assessments)",
    route: "/teacher/assessments",
    trigger: { role: "button", name: "New assessment", exact: true },
    ready: { role: "heading", name: "New assessment" },
  },
];

/** Opens one of the cases above, or skips when the page cannot offer it. */
async function openDialog(page, entry) {
  await page.goto(entry.route);
  const trigger = page.getByRole(entry.trigger.role, {
    name: entry.trigger.name,
    // `exact` is meaningless against a pattern, and passing it with one is a
    // Playwright error rather than a no-op.
    ...(entry.trigger.exact === undefined ? {} : { exact: entry.trigger.exact }),
  }).first();

  await expect(trigger).toBeVisible();
  test.skip(await trigger.isDisabled(), `${entry.name} cannot be opened on this data`);

  // How wide the page is before the dialog exists, so the dialog is only
  // blamed for what it actually adds.
  const baselineScrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );

  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  return { trigger, baselineScrollWidth };
}

describe("teacher/administrator dialogs at every width", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/dashboard");
  });

  for (const entry of DIALOGS) {
    test(`${entry.name} fits every viewport`, async ({ page }) => {
      test.setTimeout(90_000);

      for (const viewport of DIALOG_VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const { baselineScrollWidth } = await openDialog(page, entry);
        await expectDialogFits(page, viewport, { baselineScrollWidth });
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toBeHidden();
      }
    });

    test(`${entry.name} keeps its keyboard behaviour on a phone`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      const { trigger } = await openDialog(page, entry);

      await expectDialogBehaviour(page, trigger);
    });
  }

  test("a dropdown opened inside a dialog stays on screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/teacher/learning-modules");

    const trigger = page.getByRole("button", { name: "New module", exact: true });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The form uses native selects, whose popup the browser positions; what
    // has to hold is that the control itself is reachable and on screen.
    const selects = dialog.locator("select");
    const count = await selects.count();
    test.skip(count === 0, "this dialog has no dropdown");

    for (let index = 0; index < count; index += 1) {
      const box = await selects.nth(index).boundingBox();
      if (!box) continue;
      expect(box.x, "a dropdown starts off the left edge").toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, "a dropdown runs past the right edge").toBeLessThanOrEqual(321);
    }
  });
});
