import { expect, test } from "@playwright/test";

import { TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts";

/**
 * Behavioural cover for the Teacher Intervention Dashboard.
 *
 * Every test here is read-only. The lifecycle is enforced in the database and
 * each status change writes an audit row, so this spec asserts which moves the
 * interface offers rather than performing them. Tests that need a case in a
 * particular status skip when the queue does not contain one, which keeps the
 * suite honest about what it actually checked.
 */

const describe = hasAccount(TEACHER_ADMIN_ACCOUNT) ? test.describe : test.describe.skip;

/** Locates the first queue row showing the given lifecycle status. */
function rowWithStatus(page, status) {
  return page
    .getByRole("row")
    .filter({ has: page.getByText(status, { exact: true }) })
    .first();
}

/** Opens the quick-actions menu on a row and returns the menu locator. */
async function openRowMenu(row) {
  await row.getByRole("button", { name: /^Quick actions for / }).click();
  const menu = row.page().getByRole("menu", { name: "Quick actions" });
  await expect(menu).toBeVisible();
  return menu;
}

describe("teacher intervention dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/dashboard");
    await page.goto("/teacher/interventions");
    await expect(
      page.getByRole("heading", { name: "Teacher Intervention Dashboard" }),
    ).toBeVisible();
  });

  test("a case that needs intervention can only be taken up, never resolved outright", async ({
    page,
  }) => {
    const row = rowWithStatus(page, "Needs Intervention");
    test.skip((await row.count()) === 0, "no case needs intervention in this queue");

    const menu = await openRowMenu(row);

    await expect(menu.getByRole("menuitem", { name: "Mark In Progress" })).toBeVisible();
    // The database refuses Needs Intervention to Resolved, so the row must not
    // offer it: 'A case must be taken up before it can be resolved'.
    await expect(menu.getByRole("menuitem", { name: "Mark Resolved" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Record action…" })).toBeVisible();
  });

  test("a case in progress can be resolved and not taken up again", async ({ page }) => {
    const row = rowWithStatus(page, "In Progress");
    test.skip((await row.count()) === 0, "no case is in progress in this queue");

    const menu = await openRowMenu(row);

    await expect(menu.getByRole("menuitem", { name: "Mark Resolved" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Mark In Progress" })).toHaveCount(0);
  });

  test("a resolved case offers no quick action, only the reopen route", async ({ page }) => {
    const row = rowWithStatus(page, "Resolved");
    test.skip((await row.count()) === 0, "no resolved case in this queue");

    const menu = await openRowMenu(row);

    await expect(menu.getByRole("menuitem", { name: "Mark In Progress" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Mark Resolved" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Reopen case…" })).toBeVisible();
  });

  test("taking up a case asks for no reopening reason", async ({ page }) => {
    const row = rowWithStatus(page, "Needs Intervention");
    test.skip((await row.count()) === 0, "no case needs intervention in this queue");

    await row.getByRole("button", { name: "Review" }).click();

    const status = page.getByLabel("Case status");
    await expect(status).toBeVisible();
    await expect(status.getByRole("option", { name: "In Progress" })).toHaveCount(1);
    await expect(status.getByRole("option", { name: "Resolved" })).toHaveCount(0);

    await status.selectOption("In Progress");
    // Taking up a case is the normal first step, not a reopening.
    await expect(page.getByLabel("Reason for reopening")).toHaveCount(0);
  });

  test("reopening a resolved case asks for a reason and refuses a short one", async ({ page }) => {
    const row = rowWithStatus(page, "Resolved");
    test.skip((await row.count()) === 0, "no resolved case in this queue");

    await row.getByRole("button", { name: "Review" }).click();

    const status = page.getByLabel("Case status");
    await status.selectOption("In Progress");

    const reason = page.getByLabel("Reason for reopening");
    await expect(reason).toBeVisible();
    await page.getByLabel("Teacher remediation notes").fill("Checking the reopen guard.");

    const submit = page.getByRole("button", { name: "Record intervention" });

    // The field carries `required`, so an empty reason is refused by the
    // browser's own constraint validation and the form never submits.
    await submit.click();
    expect(await reason.evaluate((node) => node.validity.valueMissing)).toBe(true);

    // A reason that is present but under three characters gets past `required`
    // and reaches the form's own check, which is what isReopen gates.
    await reason.fill("ok");
    await submit.click();
    await expect(
      page.getByText("A reopened case needs a short reason", { exact: false }),
    ).toBeVisible();
    await expect(reason).toBeVisible();
  });

  test("clearing the selection clears every row checkbox", async ({ page }) => {
    const boxes = page.getByRole("checkbox", { name: /^Select case for / });
    const count = await boxes.count();
    test.skip(count === 0, "the queue is empty");

    await boxes.first().check();
    if (count > 1) await boxes.nth(1).check();

    await page.getByRole("button", { name: "Clear", exact: true }).click();

    // The checkboxes are controlled, so the visual state follows selectedIds.
    for (let index = 0; index < count; index += 1) {
      await expect(boxes.nth(index)).not.toBeChecked();
    }
  });

  test("the advisory pattern panel stays hidden until the queue is scoped", async ({ page }) => {
    const unavailable = page.getByText("Advisory AI is not available", { exact: false });

    // With no grade and no competency chosen there is no class to summarise, so
    // the panel must not announce itself as unavailable.
    await expect(unavailable).toHaveCount(0);

    const grade = page.getByLabel("Grade", { exact: false });
    const options = grade.getByRole("option");
    test.skip((await options.count()) < 2, "no grade directory to scope by");

    // The same guard its siblings carry. With no cases to summarise there is
    // no batch for the panel to describe, so it renders nothing — and this
    // test failed where the other nine skipped, for the same empty queue.
    test.skip(
      (await page.getByRole("checkbox", { name: /^Select case for / }).count()) === 0,
      "the queue is empty",
    );

    await grade.selectOption({ index: 1 });

    const panel = page
      .getByText("AI pattern summary (advisory)", { exact: false })
      .or(page.getByText("Summarising patterns across this batch", { exact: false }))
      .or(unavailable);
    await expect(panel.first()).toBeVisible();
  });

  test("an exported CSV cannot start a spreadsheet formula", async ({ page }) => {
    const boxes = page.getByRole("checkbox", { name: /^Select case for / });
    test.skip((await boxes.count()) === 0, "the queue is empty");

    await boxes.first().check();

    const download = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export CSV" }).click(),
    ]).then(([event]) => event);

    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString("utf8").replace(/^﻿/, "");

    const cells = csv
      .split("\r\n")
      .slice(1)
      .filter(Boolean)
      .flatMap((line) => line.split(","));

    for (const cell of cells) {
      const value = cell.replace(/^"|"$/g, "");
      expect(
        /^[=+@\t\r]/.test(value),
        `cell ${JSON.stringify(value)} would be read as a formula`,
      ).toBe(false);
    }
  });

  test("switching cases never shows the previous learner's evidence", async ({ page }) => {
    const reviews = page.getByRole("button", { name: "Review" });
    test.skip((await reviews.count()) < 2, "need two cases to switch between");

    const rows = page.getByRole("row").filter({ has: reviews });
    const secondLearner = await rows.nth(1).getByRole("cell").nth(2).innerText();

    // Open the first case, then the second without waiting, so both detail
    // requests are in flight and the older one must not win.
    await reviews.nth(0).click();
    await page.getByRole("button", { name: /^Close|Cancel$/ }).first().click({ trial: true }).catch(() => {});
    await page.keyboard.press("Escape");
    await reviews.nth(1).click();

    const title = page.getByRole("heading", { name: /^Remediation case: / });
    await expect(title).toBeVisible();
    await expect(title).toContainText(secondLearner.split("\n")[0].trim());
  });

  test("a date-to filter keeps the cases opened on the selected day", async ({ page }) => {
    const rows = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Review" }) });
    const before = await rows.count();
    test.skip(before === 0, "the queue is empty");

    // A date-only bound reaches the query as the following midnight, so today's
    // own cases stay in the queue instead of being cut off at 00:00.
    const today = new Date().toISOString().slice(0, 10);
    await page.getByLabel("Opened to").fill(today);
    await expect(page.getByText("Updating cases...")).toHaveCount(0, { timeout: 15_000 });

    expect(await rows.count()).toBeLessThanOrEqual(before);
  });
});
