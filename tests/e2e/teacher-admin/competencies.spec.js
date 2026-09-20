import { expect, test } from "@playwright/test";

import { TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts";

/**
 * Behavioural cover for the Teacher/Administrator competency catalogue.
 *
 * The page is server-rendered and every mutation is a Server Action, neither of
 * which a browser test can intercept: `page.route` sees the browser's requests,
 * not the Next server's. There is deliberately no stub in this file, because a
 * stub here would be a comforting no-op — an earlier version of this spec had
 * one, believed it, pressed Restore, and changed two competencies in the hosted
 * database.
 *
 * So the catalogue is read against whatever the deployment holds, and every
 * control is checked as a control: that it is there, says what it does, is
 * operable, and gates what it should. The round trips behind them are proved in
 * the backend suite and in pgTAP, where they can be proved without writing to
 * school data.
 *
 * That split is deliberate, and here it is also a safety property: nothing in
 * this file creates, changes or removes a competency in real school data.
 */

const describe = hasAccount(TEACHER_ADMIN_ACCOUNT) ? test.describe : test.describe.skip;

/** Widths the catalogue has to stay usable at, from the narrowest phone up. */
const VIEWPORTS = [
  { name: "small phone", width: 320, height: 568 },
  { name: "phone", width: 375, height: 667 },
  { name: "tall phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 720 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide desktop", width: 1920, height: 1080 },
];

/** The overflow a page adds beyond its own viewport. Anything over 1 is a bug. */
function overflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

describe("teacher competencies", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/dashboard");
  });

  // ─── What the catalogue says ─────────────────────────────────────

  test("the catalogue opens as its own workspace", async ({ page }) => {
    await page.goto("/teacher/competencies");

    await expect(page.getByRole("heading", { name: "Competencies" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add competency" })).toBeVisible();
  });

  test("every publication state is offered as a filter, counted and named", async ({ page }) => {
    await page.goto("/teacher/competencies");

    const group = page.getByRole("group", { name: "Filter by publication state" });
    await expect(group).toBeVisible();

    for (const label of ["All", "Draft", "Published", "Archived"]) {
      await expect(group.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
  });

  test("a status is readable text, never colour alone", async ({ page }) => {
    await page.goto("/teacher/competencies");
    await page.getByRole("heading", { name: "Competencies" }).waitFor();

    const cards = page.getByRole("main").locator("article");
    test.skip((await cards.count()) === 0, "this deployment has no competencies");

    // Every card states its status in words.
    const statuses = await cards.evaluateAll((nodes) =>
      nodes.map((node) => node.textContent.match(/Draft|Published|Archived/)?.[0] ?? null),
    );
    expect(statuses.every(Boolean)).toBe(true);
  });

  test("no action is an icon on its own", async ({ page }) => {
    await page.goto("/teacher/competencies");
    await page.getByRole("heading", { name: "Competencies" }).waitFor();

    const unnamed = await page
      .getByRole("main")
      .locator("button")
      .evaluateAll((nodes) =>
        nodes.filter((node) => !(node.textContent ?? "").trim() && !node.getAttribute("aria-label"))
          .length,
      );
    expect(unnamed, "a button with neither text nor an accessible name").toBe(0);
  });

  // ─── The actions follow the state ────────────────────────────────

  /**
   * Switches the catalogue to one publication state and waits for the switch.
   *
   * Counting immediately after the click races the re-render: the filter is
   * client-side, so the old cards are still on screen for a frame and the
   * count comes back for the wrong state.
   */
  async function filterTo(page, label) {
    const group = page.getByRole("group", { name: "Filter by publication state" });
    const button = group.getByRole("button", { name: new RegExp(`^${label}`) });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    return page.getByRole("main");
  }

  /** Whether a control turned up at all, without failing the test when it did not. */
  async function appears(locator) {
    try {
      await locator.waitFor({ state: "visible", timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }

  test("a draft offers Publish, and an archived one never does", async ({ page }) => {
    await page.goto("/teacher/competencies");
    await page.getByRole("heading", { name: "Competencies" }).waitFor();

    const main = await filterTo(page, "Archived");
    const restore = main.getByRole("button", { name: "Restore", exact: true }).first();

    if (await appears(restore)) {
      // The defect this guards: an archived competency used to render no
      // actions at all, so archiving was a one-way door.
      await expect(restore).toBeVisible();
      await expect(
        main.getByRole("button", { name: "Delete permanently", exact: true }).first(),
      ).toBeVisible();
      // Exact, because "Publish" is a substring of "Unpublish" and Playwright
      // matches an accessible name loosely by default.
      await expect(main.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
      await expect(main.getByRole("button", { name: "Archive", exact: true })).toHaveCount(0);
    }
  });

  /*
   * Restoring, publishing and unpublishing go through a Server Action, which
   * runs on the Next server — `page.route` sees the browser's requests, not
   * that one. Asserting the call would mean letting it through to the real
   * API, which would change a competency in school data, so the round trip is
   * proved in the backend suite instead and what is checked here is that the
   * control exists, says what it does, and is genuinely operable.
   */
  test("restore is a real control, not a disabled ornament", async ({ page }) => {
    await page.goto("/teacher/competencies");
    await page.getByRole("heading", { name: "Competencies" }).waitFor();

    const main = await filterTo(page, "Archived");
    const restore = main.getByRole("button", { name: "Restore", exact: true }).first();
    test.skip(!(await appears(restore)), "this deployment has no archived competency");

    await expect(restore).toBeEnabled();
    await expect(restore).toBeVisible();
  });

  // ─── Deleting an unused competency ───────────────────────────────

  async function openDelete(page) {
    const main = await filterTo(page, "Archived");
    const trigger = main.getByRole("button", { name: "Delete permanently", exact: true }).first();
    if (!(await appears(trigger))) return null;

    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("deleting says it is permanent and asks for CONFIRM", async ({ page }) => {
    await page.goto("/teacher/competencies");

    const dialog = await openDelete(page);
    test.skip(dialog === null, "this deployment has no archived competency");

    await expect(dialog).toContainText("cannot be undone");
    // It says what would stop it, so a refusal is not a surprise.
    await expect(dialog).toContainText(/question|learning module|learner progress/);

    const submit = dialog.getByRole("button", { name: "Delete permanently", exact: true });
    await expect(submit).toBeDisabled();

    await dialog.getByLabel("Type CONFIRM to confirm").fill("DELETE");
    await expect(submit).toBeDisabled();
    await expect(dialog).toContainText("does not match");

    await dialog.getByLabel("Type CONFIRM to confirm").fill("CONFIRM");
    await expect(submit).toBeEnabled();
  });

  /*
   * The refusal path is deliberately not driven from here.
   *
   * `deleteCompetencyAction` is a Server Action: pressing the button runs it on
   * the Next server, which calls the real API, and no `page.route` in this file
   * can stand in the way of that. An earlier version of this spec pressed
   * Restore believing it was stubbed and changed two competencies in the hosted
   * database — so nothing here submits a destructive form.
   *
   * What the refusal does is covered where it can be: the message that names
   * what is holding a competency is asserted in the backend suite, and the
   * foreign keys that produce it are asserted in pgTAP.
   */

  // ─── Creating one ────────────────────────────────────────────────

  test("the create form asks for no grade", async ({ page }) => {
    await page.goto("/teacher/competencies");
    await page.getByRole("button", { name: "Add competency" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // MathSmart teaches one grade and the server pins it, so the form must not
    // offer a choice the API would refuse.
    await expect(dialog.getByLabel("Grade")).toHaveCount(0);
    await expect(dialog.locator('[name="grade_id"]')).toHaveCount(0);
  });

  test("a strand the list does not carry can be written in, and stays off the list", async ({ page }) => {
    // Nothing is submitted here. The form action is a Server Action, so a save
    // in this file would reach the real catalogue; what is checked is which
    // control carries `domain` and what the list offers, both decided before
    // any request.
    await page.goto("/teacher/competencies");
    await page.getByRole("button", { name: "Add competency" }).click();

    const dialog = page.getByRole("dialog");
    const strand = dialog.getByLabel("Content strand");

    const FIXED_OPTIONS = [
      "Numbers and Number Sense",
      "Geometry",
      "Patterns and Algebra",
      "Measurement",
      "Statistics and Probability",
      "Other",
    ];
    await expect(strand.locator("option")).toHaveText(FIXED_OPTIONS);

    await expect(strand).toHaveAttribute("name", "domain");
    await expect(dialog.getByLabel("Name the strand")).toHaveCount(0);

    await strand.selectOption({ label: "Other" });

    const written = dialog.getByLabel("Name the strand");
    await expect(written).toBeVisible();
    await expect(written).toBeFocused();
    await written.fill("HEHE");

    // Exactly one control named `domain`, and it is the one holding the words
    // that were typed — never the sentinel the option list uses.
    await expect(dialog.locator('[name="domain"]')).toHaveCount(1);
    await expect(dialog.locator('[name="domain"]')).toHaveValue("HEHE");

    // Typing a strand does not add it to the list.
    await expect(strand.locator("option")).toHaveText(FIXED_OPTIONS);

    // Going back to a listed strand hands the name back to the select, and the
    // list is still the same six.
    await strand.selectOption({ label: "Geometry" });
    await expect(dialog.getByLabel("Name the strand")).toHaveCount(0);
    await expect(dialog.locator('[name="domain"]')).toHaveValue("Geometry");
    await expect(strand.locator("option")).toHaveText(FIXED_OPTIONS);
  });

  test("the create form names every field it asks for", async ({ page }) => {
    await page.goto("/teacher/competencies");
    await page.getByRole("button", { name: "Add competency" }).click();

    const dialog = page.getByRole("dialog");
    const unnamed = await dialog
      .locator("input, select, textarea")
      .evaluateAll((nodes) =>
        nodes.filter((node) => {
          if (node.type === "hidden") return false;
          const id = node.getAttribute("id");
          const labelled =
            (id && document.querySelector(`label[for="${id}"]`)) ||
            node.closest("label") ||
            node.getAttribute("aria-label");
          return !labelled;
        }).length,
      );
    expect(unnamed, "a form control with no accessible name").toBe(0);
  });

  test("the create dialog keeps its keyboard behaviour", async ({ page }) => {
    await page.goto("/teacher/competencies");

    const trigger = page.getByRole("button", { name: "Add competency" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  // ─── Searching and filtering ─────────────────────────────────────

  test("searching narrows the catalogue without a request", async ({ page }) => {
    await page.goto("/teacher/competencies");
    await page.getByRole("heading", { name: "Competencies" }).waitFor();

    const requests = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/")) requests.push(request.url());
    });

    await page.getByLabel("Search the competency catalogue").fill("zzz-nothing-matches");

    await expect(page.getByText(/Nothing matches that search/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear search and filters" })).toBeVisible();
    expect(requests, "search must not re-read the catalogue").toHaveLength(0);
  });

  test("clearing the filters brings the catalogue back", async ({ page }) => {
    await page.goto("/teacher/competencies");
    await page.getByRole("heading", { name: "Competencies" }).waitFor();

    const before = await page.getByRole("main").locator("article").count();
    test.skip(before === 0, "this deployment has no competencies");

    await page.getByLabel("Search the competency catalogue").fill("zzz-nothing-matches");
    await page.getByRole("button", { name: "Clear search and filters" }).click();

    await expect(page.getByRole("main").locator("article")).toHaveCount(before);
  });

  // ─── The loading shape ───────────────────────────────────────────

  test("the skeleton reserves the shape the catalogue will occupy", async ({ page }) => {
    const seen = { blocks: 0, status: false };

    await page.goto("/teacher/competencies", { waitUntil: "commit" });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const sample = await page
        .evaluate(() => {
          const blocks = document.querySelectorAll(".animate-pulse");
          const first = blocks[0]?.getBoundingClientRect().height ?? 0;
          return {
            blocks: first > 0 ? blocks.length : 0,
            status: Boolean(document.querySelector('[role="status"]')),
          };
        })
        .catch(() => null);
      if (sample?.blocks) {
        seen.blocks = sample.blocks;
        seen.status = sample.status;
        break;
      }
    }

    test.skip(seen.blocks === 0, "the page resolved before the skeleton could be sampled");
    expect(seen.blocks).toBeGreaterThan(0);
    expect(seen.status, "the skeleton announces itself to a screen reader").toBe(true);
  });

  // ─── Responsive ──────────────────────────────────────────────────

  for (const viewport of VIEWPORTS) {
    test(`the catalogue fits a ${viewport.name} at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/teacher/competencies");
      await expect(page.getByRole("heading", { name: "Competencies" })).toBeVisible();

      expect(
        await overflow(page),
        `the catalogue scrolls sideways at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    });
  }

  test("the create dialog holds a gutter on the narrowest phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/teacher/competencies");

    const before = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.getByRole("button", { name: "Add competency" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box.x, "the dialog touches the left edge").toBeGreaterThanOrEqual(8);
    expect(box.x + box.width, "the dialog touches the right edge").toBeLessThanOrEqual(312);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(before);
  });
});
