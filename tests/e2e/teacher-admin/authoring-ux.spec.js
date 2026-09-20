import { expect, test } from "@playwright/test";

import { TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts";
import {
  accessToken,
  api,
  createCompetency,
  removeCompetency,
} from "../support/api-fixtures";
import { hostedDataSkipReason, isLocalDataEnvironment } from "../support/environment";

/**
 * The authoring screens' behaviour, rather than their content.
 *
 * Every assertion here comes from a reported live-acceptance failure: a page
 * replaced by its own skeleton for something as ordinary as picking a filter,
 * two scrollbars inside one dialog, a row of tabs that scrolled vertically, a
 * list that jumped to the top whenever anything was clicked, tabs that only
 * counted the state you were already looking at, and cards whose actions sat a
 * screenful below their content.
 *
 * Nothing here writes. It reads the four authoring screens, drives their
 * filters, and measures what comes back, so it is safe to run against any
 * environment the account can reach — though it still refuses a hosted one,
 * because a signed-in read of somebody's real content is not this suite's
 * business either.
 */
const canRun = hasAccount(TEACHER_ADMIN_ACCOUNT) && isLocalDataEnvironment();
const describe = canRun ? test.describe.serial : test.describe.skip;

/** The widths every authoring screen has to survive. */
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1536, height: 864 },
  { name: "wide", width: 1920, height: 1080 },
];

/** A search term nothing can match, which is how a zero count is guaranteed. */
const NO_MATCH = "zzzz-no-such-record-zzzz";

/** One suffix per run, so nothing collides and everything is recognisable. */
const RUN = `UX${Date.now().toString(36).toUpperCase()}`;

/**
 * Three activities, because the complaint was about the space between a card's
 * content and its actions — and that space depends entirely on how much the
 * card holds. One with no instructions at all, one with a line, and one with
 * more prose than a card in a three-column grid can carry.
 */
const LONG_INSTRUCTIONS = [
  "Work through every item in order and show the regrouping on paper before",
  "entering an answer. If a learner misses two in a row, stop and reteach the",
  "borrowing step with base-ten blocks before letting them continue, because",
  "the pattern of error matters more here than the final score does. Record",
  "what you saw so the next session starts from evidence rather than memory.",
].join(" ");

const ACTIVITY_FIXTURES = [
  { key: "none", title: `Disposable UX activity ${RUN} none`, description: null },
  { key: "short", title: `Disposable UX activity ${RUN} short`, description: "Ten quick drills." },
  { key: "long", title: `Disposable UX activity ${RUN} long`, description: LONG_INSTRUCTIONS },
];

/** Signs in and lands on the workspace. */
async function arrive(page) {
  await signIn(page, TEACHER_ADMIN_ACCOUNT);
  await page.waitForURL("**/teacher/**", { timeout: 20_000 });
}

/** Narrows the activities list to this run's own cards. */
async function narrowToFixtures(page) {
  const search = page.getByLabel("Search activities");
  await expect(search).toBeVisible({ timeout: 20_000 });
  await search.fill(RUN);
  await expect(page.locator('[data-slot="card"]')).toHaveCount(ACTIVITY_FIXTURES.length, {
    timeout: 20_000,
  });
}

/** The vertical scroll offset of the window. */
function scrollTop(page) {
  return page.evaluate(() => window.scrollY);
}

/**
 * Scrolls far enough down that a jump to the top is unmistakable.
 *
 * The viewport is shortened first, because a local stack can hold two rows and
 * a page that does not scroll cannot prove that it kept its place.
 */
async function scrollDown(page, offset = 300) {
  await page.setViewportSize({ width: 390, height: 420 });
  await page.evaluate((y) => window.scrollTo(0, y), offset);
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);
  return scrollTop(page);
}

/**
 * Asserts the page did not jump back to the top.
 *
 * Measured against what the new page can actually hold: narrowing a list to
 * three rows leaves nowhere to be scrolled to, and a browser clamping an
 * offset it can no longer honour is not the defect being tested.
 */
async function expectKeptPlace(page, before) {
  const reachable = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  );
  const floor = Math.min(before, reachable) / 2;
  expect(await scrollTop(page)).toBeGreaterThanOrEqual(floor);
}

/** Every element on the page that scrolls vertically, with its label. */
function verticalScrollers(page) {
  return page.evaluate(() => {
    const found = [];
    for (const node of document.querySelectorAll("*")) {
      const style = getComputedStyle(node);
      const scrollable = style.overflowY === "auto" || style.overflowY === "scroll";
      if (scrollable && node.scrollHeight > node.clientHeight + 1) {
        found.push(node.tagName.toLowerCase() + "." + String(node.className).slice(0, 60));
      }
    }
    return found;
  });
}

describe("teacher authoring behaviour", () => {
  test.skip(!isLocalDataEnvironment(), hostedDataSkipReason());

  // A local stack can hold no activities at all, and a card that does not
  // exist cannot be measured. These are created through the API rather than
  // the authoring dialogs: the dialogs are tested elsewhere, and this
  // specification is about what the cards look like once they exist.
  let competencyId = null;
  let moduleId = null;
  let readyModuleId = null;
  let questionId = null;
  let assessmentId = null;
  const activityIds = [];

  test.beforeAll(async ({ request }) => {
    const token = await accessToken(request);
    competencyId = await createCompetency(request, token, {
      code: `UXNS-${RUN.slice(-7)}`,
      name: `Disposable UX competency ${RUN}`,
    });

    const createdModule = await api(request, token, "/teacher-admin/modules", {
      method: "POST",
      data: {
        competency_id: competencyId,
        title: `Disposable UX module ${RUN}`,
        estimated_minutes: 20,
        learning_objective: "Created by the browser suite. Safe to remove.",
        short_explanation: "Created by the browser suite. Safe to remove.",
        rules: [],
        worked_examples: [],
        order_index: 0,
      },
    });
    expect(createdModule.ok()).toBe(true);
    moduleId = (await createdModule.json()).data.module_id;

    for (const fixture of ACTIVITY_FIXTURES) {
      const created = await api(request, token, "/teacher-admin/activities", {
        method: "POST",
        data: {
          module_id: moduleId,
          title: fixture.title,
          description: fixture.description,
          estimated_minutes: 15,
          points: 10,
          mastery_threshold: 75,
        },
      });
      expect(created.ok()).toBe(true);
      activityIds.push((await created.json()).data.activity_id);
    }

    // One of them archived, so the archived card's own action group — Restore
    // beside Delete permanently — is on screen to be measured too.
    const archived = await api(request, token, `/teacher-admin/activities/${activityIds[1]}`, {
      method: "PATCH",
      data: { status: "archived" },
    });
    expect(archived.ok()).toBe(true);

    // A second module, finished this time: one complete rule and one complete
    // worked example, which is exactly what publishing asks for. The first
    // module has neither, so the two of them cover both sides of the new row
    // control without either test having to author content through a dialog.
    const readyModule = await api(request, token, "/teacher-admin/modules", {
      method: "POST",
      data: {
        competency_id: competencyId,
        title: `Disposable UX module ${RUN} ready`,
        estimated_minutes: 20,
        learning_objective: "Created by the browser suite. Safe to remove.",
        short_explanation: "Created by the browser suite. Safe to remove.",
        rules: [
          {
            title: "Add the ones first",
            ruleFormula: "",
            explanation: "Regroup when the ones column reaches ten.",
            visualExample: "",
          },
        ],
        worked_examples: [{ problem: "27 + 45", steps: [], solution: "72", tip: "" }],
        order_index: 1,
      },
    });
    expect(readyModule.ok()).toBe(true);
    readyModuleId = (await readyModule.json()).data.module_id;

    // A published assessment, so the way back out of publication has something
    // to act on. It needs a published question in it, which is the API's own
    // precondition rather than this suite's invention.
    const question = await api(request, token, "/teacher-admin/questions", {
      method: "POST",
      data: {
        competency_id: competencyId,
        question_type: "multiple_choice",
        difficulty: "easy",
        prompt: `Disposable UX question ${RUN}: what is 5 + 5?`,
        choices: ["9", "10", "11"],
        answer_key: "10",
        status: "published",
      },
    });
    expect(question.ok()).toBe(true);
    questionId = (await question.json()).data.question_id;

    const assessment = await api(request, token, "/teacher-admin/assessments", {
      method: "POST",
      data: {
        title: `Disposable UX assessment ${RUN}`,
        assessment_type: "diagnostic",
        duration_minutes: 20,
        description: "Created by the browser suite. Safe to remove.",
      },
    });
    expect(assessment.ok()).toBe(true);
    assessmentId = (await assessment.json()).data.assessment_id;

    const seated = await api(request, token, `/teacher-admin/assessments/${assessmentId}/questions`, {
      method: "PUT",
      data: { question_ids: [questionId] },
    });
    expect(seated.ok()).toBe(true);

    const published = await api(request, token, `/teacher-admin/assessments/${assessmentId}/publish`, {
      method: "POST",
    });
    expect(published.ok()).toBe(true);
  });

  test.afterAll(async ({ request }) => {
    const token = await accessToken(request);

    // Archived first, because permanent deletion is archived-only — which is
    // the rule this teardown happens to prove.
    for (const activityId of activityIds) {
      await api(request, token, `/teacher-admin/activities/${activityId}`, {
        method: "PATCH",
        data: { status: "archived" },
      });
      await api(request, token, `/teacher-admin/activities/${activityId}/delete`, {
        method: "POST",
      });
    }

    // The assessment before the question it holds: a question something still
    // points at is refused, and that refusal is correct rather than a cleanup
    // failure.
    if (assessmentId) {
      await api(request, token, `/teacher-admin/assessments/${assessmentId}`, {
        method: "PATCH",
        data: { status: "archived" },
      });
      await api(request, token, `/teacher-admin/assessments/${assessmentId}/delete`, {
        method: "POST",
      });
    }

    if (questionId) {
      await api(request, token, `/teacher-admin/questions/${questionId}`, {
        method: "PATCH",
        data: { status: "archived" },
      });
      await api(request, token, `/teacher-admin/questions/${questionId}/delete`, {
        method: "POST",
      });
    }

    for (const id of [moduleId, readyModuleId]) {
      if (!id) {
        continue;
      }
      await api(request, token, `/teacher-admin/modules/${id}`, {
        method: "PATCH",
        data: { status: "archived" },
      });
      await api(request, token, `/teacher-admin/modules/${id}/delete`, { method: "POST" });
    }

    await removeCompetency(request, token, competencyId);
  });

  test.beforeEach(async ({ page }) => {
    await arrive(page);
  });

  // ---------------------------------------------------------------------
  // The skeleton, and the loss of place that came with it
  // ---------------------------------------------------------------------

  test("the Question Bank skeleton belongs to the first load and to nothing else", async ({
    page,
  }) => {
    await page.goto("/teacher/question-bank?status=published&page=1");
    const results = page.locator("#question-results");
    await expect(results).toBeVisible();

    const skeleton = page.getByText("Loading the Question Bank");

    // A tab, a filter and a search in turn. None of them may take the page
    // away and give back a skeleton: the rows stay, dimmed, and say they are
    // busy — which is what `aria-busy` is for.
    await page.getByRole("link", { name: /^Draft/ }).click();
    await expect(page).toHaveURL(/status=draft/);
    await expect(skeleton).toHaveCount(0);
    await expect(results).toBeVisible();

    await page.getByLabel("Difficulty").selectOption("easy");
    await expect(page).toHaveURL(/difficulty=easy/);
    await expect(skeleton).toHaveCount(0);
    await expect(results).toBeVisible();

    await page.getByLabel("Search questions").fill("fraction");
    await page.getByRole("button", { name: /^Search/ }).click();
    await expect(page).toHaveURL(/search=fraction/);
    await expect(skeleton).toHaveCount(0);
    await expect(results).toBeVisible();
  });

  test("the Learning Modules skeleton belongs to the first load and to nothing else", async ({
    page,
  }) => {
    await page.goto("/teacher/learning-modules?status=published&page=1");
    const results = page.locator("#module-results");
    await expect(results).toBeVisible();

    const skeleton = page.getByText("Loading the Learning Modules");

    await page.getByRole("link", { name: /^Draft/ }).click();
    await expect(page).toHaveURL(/status=draft/);
    await expect(skeleton).toHaveCount(0);
    await expect(results).toBeVisible();

    await page.getByLabel("Search modules").fill("integers");
    await page.getByRole("button", { name: /^Search/ }).click();
    await expect(page).toHaveURL(/search=integers/);
    await expect(skeleton).toHaveCount(0);
    await expect(results).toBeVisible();
  });

  // ---------------------------------------------------------------------
  // Scroll position
  // ---------------------------------------------------------------------

  test("the Question Bank keeps the reader's place through tabs, filters and search", async ({
    page,
  }) => {
    await page.goto("/teacher/question-bank?status=published&page=1");
    await expect(page.locator("#question-results")).toBeVisible();

    const before = await scrollDown(page);

    await page.getByRole("link", { name: /^Draft/ }).click();
    await expect(page).toHaveURL(/status=draft/);
    await expectKeptPlace(page, before);

    await page.getByLabel("Difficulty").selectOption("easy");
    await expect(page).toHaveURL(/difficulty=easy/);
    await expectKeptPlace(page, before);

    // Submitted from the keyboard. Playwright scrolls a button into view
    // before it clicks, so a mouse-driven search would measure the harness
    // moving the page rather than the page moving itself.
    await page.getByLabel("Search questions").fill("a");
    await page.getByLabel("Search questions").press("Enter");
    await expect(page).toHaveURL(/search=a/);
    await expectKeptPlace(page, before);
  });

  test("the Learning Modules list keeps the reader's place through tabs and search", async ({
    page,
  }) => {
    await page.goto("/teacher/learning-modules?status=published&page=1");
    await expect(page.locator("#module-results")).toBeVisible();

    const before = await scrollDown(page);

    await page.getByRole("link", { name: /^Draft/ }).click();
    await expect(page).toHaveURL(/status=draft/);
    await expectKeptPlace(page, before);

    await page.getByLabel("Search modules").fill("a");
    await page.getByLabel("Search modules").press("Enter");
    await expect(page).toHaveURL(/search=a/);
    await expectKeptPlace(page, before);
  });

  test("the back button still walks the filters it recorded", async ({ page }) => {
    await page.goto("/teacher/question-bank?status=published&page=1");
    await page.getByRole("link", { name: /^Draft/ }).click();
    await expect(page).toHaveURL(/status=draft/);

    await page.goBack();
    await expect(page).toHaveURL(/status=published/);
    await expect(page.getByRole("link", { name: /^Published/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  // ---------------------------------------------------------------------
  // The tab strip itself
  // ---------------------------------------------------------------------

  for (const viewport of VIEWPORTS) {
    test(`the status tabs never scroll vertically at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const route of ["/teacher/question-bank", "/teacher/learning-modules"]) {
        await page.goto(route);
        const strip = page.getByRole("navigation", { name: /Filter (questions|modules)/ });
        await expect(strip).toBeVisible();

        const box = await strip.evaluate((node) => ({
          overflowY: getComputedStyle(node).overflowY,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
        }));

        // `overflow-y: visible` beside `overflow-x: auto` computes to `auto`,
        // which is what put a pair of scroll arrows beside the tabs.
        expect(box.overflowY).toBe("hidden");
        expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1);
      }
    });
  }

  // ---------------------------------------------------------------------
  // The counts
  // ---------------------------------------------------------------------

  test("every Question Bank tab carries its own count, from the whole collection", async ({
    page,
    request,
  }) => {
    // Read from the API rather than from an intercepted browser request: the
    // list is rendered on the server, so nothing about it crosses the network
    // the browser can see.
    const token = await accessToken(request);
    const reply = await api(request, token, "/teacher-admin/questions?status=published&page=1");
    expect(reply.ok()).toBe(true);
    const counts = (await reply.json()).meta.status_counts;

    await page.goto("/teacher/question-bank?status=published&page=1");

    for (const [label, state] of [
      ["Draft", "draft"],
      ["Published", "published"],
      ["Archived", "archived"],
    ]) {
      const tab = page.getByRole("link", { name: new RegExp(`^${label}`) });
      await expect(tab).toContainText(String(counts[state]));
    }

    // The badge describes the collection, not the page: a page holds ten rows
    // at most, and the published total may be larger than what is on screen.
    const rows = await page.locator("#question-results > *").count();
    expect(counts.published).toBeGreaterThanOrEqual(Math.min(rows, counts.published));
  });

  test("a state holding nothing shows a zero rather than no badge at all", async ({ page }) => {
    await page.goto(
      `/teacher/question-bank?status=published&page=1&search=${encodeURIComponent(NO_MATCH)}`,
    );

    for (const label of ["Draft", "Published", "Archived"]) {
      await expect(page.getByRole("link", { name: new RegExp(`^${label}`) })).toContainText("0");
    }
  });

  test("every Learning Modules tab carries its own count", async ({ page, request }) => {
    const token = await accessToken(request);
    const reply = await api(request, token, "/teacher-admin/modules?status=published&page=1");
    expect(reply.ok()).toBe(true);
    const counts = (await reply.json()).meta.status_counts;

    await page.goto("/teacher/learning-modules?status=published&page=1");

    for (const [label, state] of [
      ["Draft", "draft"],
      ["Published", "published"],
      ["Archived", "archived"],
    ]) {
      await expect(page.getByRole("link", { name: new RegExp(`^${label}`) })).toContainText(
        String(counts[state]),
      );
    }
  });

  test("the Assessments tabs carry counts too, including All", async ({ page }) => {
    await page.goto("/teacher/assessments");
    const tabs = page.getByRole("tab");
    await expect(tabs.first()).toBeVisible();

    const labels = ["All", "Drafts", "Published", "Archived"];
    const numbers = [];
    for (const label of labels) {
      const tab = page.getByRole("tab", { name: new RegExp(`^${label}`) });
      await expect(tab).toHaveText(new RegExp(`${label}\\s*\\d+`));
      numbers.push(Number((await tab.innerText()).replace(/\D+/g, "")));
    }

    // All is the other three, which is the only reading that makes the four
    // numbers describe one collection.
    expect(numbers[0]).toBe(numbers[1] + numbers[2] + numbers[3]);
  });

  // ---------------------------------------------------------------------
  // The activity cards
  // ---------------------------------------------------------------------

  test("activity cards sit close to their content and reflow at every width", async ({ page }) => {
    await page.goto("/teacher/activities");
    await narrowToFixtures(page);
    const cards = page.locator('[data-slot="card"]');
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      // The list re-reads itself when the shell changes shape, so the cards go
      // away and come back.
      await expect(cards.first()).toBeVisible({ timeout: 20_000 });

      const gaps = await cards.evaluateAll((nodes) =>
        nodes.map((card) => {
          const footer = card.querySelector('[data-slot="card-footer"]');
          const content = card.querySelector('[data-slot="card-content"]');
          if (!footer || !content) {
            return 0;
          }
          // The distance between where the content ends and the actions
          // begin. A card stretched to its row's height used to open a band
          // of several hundred pixels here.
          return footer.getBoundingClientRect().top - content.getBoundingClientRect().bottom;
        }),
      );

      for (const gap of gaps) {
        expect(gap).toBeLessThan(48);
      }

      // Nothing overflows the viewport sideways at any width.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test("long activity instructions are previewed behind a real control", async ({ page }) => {
    await page.goto("/teacher/activities");
    await narrowToFixtures(page);
    await expect(page.locator('[data-slot="card"]').first()).toBeVisible({ timeout: 20_000 });

    const toggles = page.getByRole("button", { name: "Show all instructions" });
    const count = await toggles.count();
    test.skip(count === 0, "No activity in this environment has instructions long enough to clamp");

    const first = toggles.first();
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await first.click();
    await expect(page.getByRole("button", { name: "Show less" }).first()).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  // ---------------------------------------------------------------------
  // Publishing from the row
  // ---------------------------------------------------------------------

  test("a finished draft module is published from its own row", async ({ page }) => {
    await page.goto(`/teacher/learning-modules?status=draft&search=${encodeURIComponent(RUN)}`);

    const title = `Disposable UX module ${RUN} ready`;
    await expect(page.getByRole("heading", { name: title, level: 3 })).toBeVisible();

    await page.getByRole("button", { name: `Publish ${title}` }).click();

    // The row leaves the draft tab, and the module is on the published one.
    await expect(page.getByRole("heading", { name: title, level: 3 })).toHaveCount(0, {
      timeout: 20_000,
    });

    await page.goto(
      `/teacher/learning-modules?status=published&search=${encodeURIComponent(RUN)}`,
    );
    await expect(page.getByRole("heading", { name: title, level: 3 })).toBeVisible();

    // Nothing offers to publish it a second time.
    await expect(page.getByRole("button", { name: `Publish ${title}` })).toHaveCount(0);
  });

  test("an unfinished draft module says what is missing and refuses", async ({ page }) => {
    await page.goto(`/teacher/learning-modules?status=draft&search=${encodeURIComponent(RUN)}`);

    const title = `Disposable UX module ${RUN}`;
    const row = page.getByRole("listitem").filter({
      has: page.getByRole("heading", { name: title, level: 3, exact: true }),
    });
    await expect(row).toBeVisible();

    // The conditions are beside the button rather than behind it.
    await expect(row).toContainText("core rule");
    await expect(row).toContainText("worked example");

    await row.getByRole("button", { name: `Publish ${title}` }).click();

    // Checked again on the server against the module it holds, so the refusal
    // is authoritative rather than the row's own guess.
    await expect(row.getByRole("alert")).toContainText(/core rule|worked example/);
    await expect(row).toContainText("Draft");
  });

  test("a published assessment can be taken back to draft", async ({ page }) => {
    await page.goto("/teacher/assessments");

    const title = `Disposable UX assessment ${RUN}`;
    await page.getByLabel(/Search assessments/i).fill(RUN);

    const row = page.getByRole("listitem").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 20_000 });

    await row.getByRole("button", { name: `Return to draft ${title}` }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Return to draft", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    // It is a draft now, so Publish is offered and the way back is not.
    await expect(row.getByRole("button", { name: `Publish ${title}` })).toBeVisible({
      timeout: 20_000,
    });
    await expect(row.getByRole("button", { name: `Return to draft ${title}` })).toHaveCount(0);
  });

  // ---------------------------------------------------------------------
  // Restoring, without losing the list or the reader's place
  // ---------------------------------------------------------------------

  test("ordinary Activities actions never replace the list with a skeleton", async ({ page }) => {
    await page.goto("/teacher/activities");
    await narrowToFixtures(page);

    const skeleton = page.getByText("Loading activities", { exact: true });
    const cards = page.locator('[data-slot="card"]');

    // The status filter, the module filter and the search box in turn. Each
    // re-reads the collection, and none of them may take the cards away.
    await page.getByLabel("Status").selectOption("draft");
    await expect(skeleton).toHaveCount(0);

    await page.getByLabel("Status").selectOption("all");
    await expect(skeleton).toHaveCount(0);
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });

    await page.getByLabel("Search activities").fill(`${RUN} long`);
    await expect(skeleton).toHaveCount(0);
    await expect(cards).toHaveCount(1, { timeout: 20_000 });
  });

  test("ordinary Assessments actions never replace the list with a skeleton", async ({ page }) => {
    await page.goto("/teacher/assessments");
    await page.getByLabel(/Search assessments/i).fill(RUN);

    const title = `Disposable UX assessment ${RUN}`;
    const row = page.getByRole("listitem").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 20_000 });

    const skeleton = page.getByText("Loading assessments", { exact: true });

    for (const label of ["Drafts", "Published", "Archived", "All"]) {
      await page.getByRole("tab", { name: new RegExp(`^${label}`) }).click();
      await expect(skeleton).toHaveCount(0);
    }

    await expect(row).toBeVisible({ timeout: 20_000 });
  });

  test("restoring an activity keeps the cards and the reader's place", async ({ page }) => {
    await page.goto("/teacher/activities");
    await narrowToFixtures(page);

    const title = `Disposable UX activity ${RUN} short`;
    const skeleton = page.getByText("Loading activities", { exact: true });

    await page.setViewportSize({ width: 390, height: 420 });
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);
    const before = await scrollTop(page);

    await page.getByRole("button", { name: `Restore ${title}` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^Restore/ }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    // The re-read keeps the cards rather than replacing them with placeholders,
    // which is also what keeps the page from collapsing and losing the offset.
    await expect(skeleton).toHaveCount(0);
    await expect(page.getByRole("heading", { name: title, level: 3 })).toBeVisible();
    await expectKeptPlace(page, before);
  });

  test("restoring an assessment keeps the rows and the reader's place", async ({
    page,
    request,
  }) => {
    // Archived through the API: getting there through the archive dialog is a
    // different control's test, and this one is about what the list does when
    // it re-reads itself.
    const token = await accessToken(request);
    const archived = await api(request, token, `/teacher-admin/assessments/${assessmentId}`, {
      method: "PATCH",
      data: { status: "archived" },
    });
    expect(archived.ok()).toBe(true);

    await page.goto("/teacher/assessments");
    await page.getByLabel(/Search assessments/i).fill(RUN);

    const title = `Disposable UX assessment ${RUN}`;
    const row = page.getByRole("listitem").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 20_000 });

    const skeleton = page.getByText("Loading assessments", { exact: true });

    await page.setViewportSize({ width: 390, height: 420 });
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);
    const before = await scrollTop(page);

    await row.getByRole("button", { name: `Restore ${title}` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Restore as draft" }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    await expect(skeleton).toHaveCount(0);
    await expect(row).toBeVisible();
    await expectKeptPlace(page, before);
  });

  // ---------------------------------------------------------------------
  // The dialogs
  // ---------------------------------------------------------------------

  test("a question dialog has one vertical scroller and keeps its header and footer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto("/teacher/question-bank");

    await page.getByRole("button", { name: /New question/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const scrollers = await verticalScrollers(page);
    expect(scrollers.length).toBeLessThanOrEqual(1);

    // The background cannot move while the dialog is open.
    const body = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(["hidden", "clip"]).toContain(body);

    // The header and the footer are both reachable without leaving the dialog.
    await expect(dialog.getByRole("heading").first()).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Cancel|Close/i }).first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});
