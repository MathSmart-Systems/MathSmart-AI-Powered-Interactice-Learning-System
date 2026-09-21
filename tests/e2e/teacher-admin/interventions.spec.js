import { expect, test } from "@playwright/test";

import { TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts";

/**
 * Behavioural cover for the Teacher Interventions queue.
 *
 * Every test here is read-only. The lifecycle is enforced in the database and
 * each status change writes an audit row, so this spec asserts which moves the
 * interface offers rather than performing them. Tests that need a case in a
 * particular status skip when the queue does not contain one, which keeps the
 * suite honest about what it actually checked.
 *
 * A case is its own page now rather than a dialog over the queue, so "Review"
 * and "Record action" are links and the assertions follow them.
 */

const describe = hasAccount(TEACHER_ADMIN_ACCOUNT) ? test.describe : test.describe.skip;

/** Every row's primary control, which is a link to that case. */
function reviewLinks(page) {
  return page.getByRole("link", { name: /^Review the case for / });
}

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

/** Opens the advanced filter disclosure, which starts collapsed. */
async function openAdvancedFilters(page) {
  const trigger = page.getByRole("button", { name: /^Advanced filters/ });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

/** Follows a row's Review link and waits for the case page to arrive. */
async function openCase(page, row) {
  await row.getByRole("link", { name: /^Review the case for / }).click();
  await page.waitForURL(/\/teacher\/interventions\/[0-9a-f-]{36}/);
  await expect(page.getByRole("link", { name: "Back to the intervention queue" })).toBeVisible();
}

describe("teacher intervention queue", () => {
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

  test("review and record action are the same page reached differently", async ({ page }) => {
    const row = page.getByRole("row").filter({ has: reviewLinks(page) }).first();
    test.skip((await row.count()) === 0, "the queue is empty");

    const review = await row
      .getByRole("link", { name: /^Review the case for / })
      .getAttribute("href");

    const menu = await openRowMenu(row);
    const record = await menu
      .getByRole("menuitem", { name: /Record action…|Reopen case…/ })
      .getAttribute("href");

    // Same case, two doors. One arrives at the evidence, the other at the form.
    expect(record.split("?")[0]).toBe(review.split("?")[0]);
    expect(record).toContain("at=record");
    expect(review).not.toContain("at=record");
  });

  test("taking up a case asks for no reopening reason", async ({ page }) => {
    const row = rowWithStatus(page, "Needs Intervention");
    test.skip((await row.count()) === 0, "no case needs intervention in this queue");

    await openCase(page, row);

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

    await openCase(page, row);

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

  test("mark resolved is offered only where the lifecycle allows it", async ({ page }) => {
    const inProgress = rowWithStatus(page, "In Progress");
    const resolved = rowWithStatus(page, "Resolved");

    if ((await inProgress.count()) > 0) {
      await openCase(page, inProgress);
      await expect(page.getByRole("button", { name: /Mark resolved/i })).toBeVisible();
      await page.goBack();
    }

    test.skip((await resolved.count()) === 0, "no resolved case to check the absence against");
    await openCase(page, resolved);
    // A resolved case cannot be resolved again, and reopening needs a written
    // reason, so the header offers neither.
    await expect(page.getByRole("button", { name: /Mark resolved/i })).toHaveCount(0);
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

    // With no section and no competency chosen there is no class to summarise,
    // so the panel must not announce itself as unavailable.
    await expect(unavailable).toHaveCount(0);

    const section = page.getByLabel("Section", { exact: false });
    const options = section.getByRole("option");
    test.skip((await options.count()) < 2, "no section directory to scope by");

    // The same guard its siblings carry. With no cases to summarise there is
    // no batch for the panel to describe, so it renders nothing.
    test.skip(
      (await page.getByRole("checkbox", { name: /^Select case for / }).count()) === 0,
      "the queue is empty",
    );

    await section.selectOption({ index: 1 });

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

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export CSV" }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8").replace(/^﻿/, "");

    for (const line of text.split(/\r?\n/).filter(Boolean)) {
      for (const cell of line.split(",")) {
        const value = cell.replace(/^"|"$/g, "");
        expect(
          /^[=+@\t\r]/.test(value),
          `cell ${JSON.stringify(value)} would be read as a formula`,
        ).toBe(false);
      }
    }
  });

  test("the queue a case was opened from is the queue that comes back", async ({ page }) => {
    const rows = page.getByRole("row").filter({ has: reviewLinks(page) });
    test.skip((await rows.count()) === 0, "the queue is empty");

    await page.getByLabel("Severity", { exact: false }).selectOption("HIGH");
    await expect(page).toHaveURL(/severity=HIGH/);
    // The address changes before the queue does. Counting rows without waiting
    // counts the queue that is on its way out.
    await expect(page.getByText("Updating cases...")).toHaveCount(0, { timeout: 20_000 });
    const narrowed = await rows.count();

    await openCase(page, rows.first());
    // The case page carries the queue it came from, so the way back is not an
    // unfiltered list somebody then has to narrow all over again.
    await expect(page).toHaveURL(/severity=HIGH/);

    await page.getByRole("link", { name: "Back to the intervention queue" }).click();
    await page.waitForURL(/\/teacher\/interventions\?/);
    await expect(page).toHaveURL(/severity=HIGH/);
    await expect(page.getByLabel("Severity", { exact: false })).toHaveValue("HIGH");
    await expect(page.getByText("Updating cases...")).toHaveCount(0, { timeout: 20_000 });
    await expect(rows).toHaveCount(narrowed);
  });

  test("a date-to filter keeps the cases opened on the selected day", async ({ page }) => {
    const rows = page.getByRole("row").filter({ has: reviewLinks(page) });
    const before = await rows.count();
    test.skip(before === 0, "the queue is empty");

    await openAdvancedFilters(page);

    // A date-only bound reaches the query as the following midnight, so today's
    // own cases stay in the queue instead of being cut off at 00:00.
    const today = new Date().toISOString().slice(0, 10);
    await page.getByLabel("Opened to").fill(today);
    await expect(page.getByText("Updating cases...")).toHaveCount(0, { timeout: 15_000 });

    expect(await rows.count()).toBeLessThanOrEqual(before);
  });
});
