import { expect, test } from "@playwright/test";

import { TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts";
import { accessToken, createCompetency, removeCompetency } from "../support/api-fixtures";
import { hostedDataSkipReason, isLocalDataEnvironment } from "../support/environment";

/**
 * The content-authoring workflow, end to end and in one direction.
 *
 * Question Bank → Learning Modules → Activities → Assessments. Each step
 * depends on the one before it, which is the whole reason to test them
 * together: a question cannot be seated in an activity until it is published,
 * an activity cannot be published under a draft module, and an assessment
 * cannot be published holding a draft question. Those refusals are the
 * product, not an edge case.
 *
 * Everything this creates carries the run's own suffix, so a failed run leaves
 * rows that are obviously test data and never collide with a parallel one. The
 * last test removes them, and it removes them through the interface: the
 * permanent-delete rules are the thing being proved, so the teardown is a test
 * rather than a hidden cleanup.
 *
 * It only runs against a local stack. The guard checks the frontend, the API
 * and Supabase, because the frontend can be served from localhost while it
 * talks to a hosted database — and this specification writes.
 */
const canRun = hasAccount(TEACHER_ADMIN_ACCOUNT) && isLocalDataEnvironment();
const describe = canRun ? test.describe.serial : test.describe.skip;

/** One suffix per run, so nothing collides and everything is recognisable. */
const RUN = `E2E${Date.now().toString(36).toUpperCase()}`;

const FIXTURE = {
  competencyCode: `E2ENS-${RUN.slice(-7)}`,
  competencyName: `Disposable competency ${RUN}`,
  firstQuestion: `Disposable question ${RUN} one: what is 5 + 5?`,
  secondQuestion: `Disposable question ${RUN} two: what is 6 + 6?`,
  moduleTitle: `Disposable module ${RUN}`,
  activityTitle: `Disposable activity ${RUN}`,
  assessmentTitle: `Disposable assessment ${RUN}`,
};

// How the competency reads in every selector: "CODE — Name".
FIXTURE.competencyLabel = `${FIXTURE.competencyCode} — ${FIXTURE.competencyName}`;

/** The widths every screen in this workflow has to survive. */
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1536, height: 864 },
  { name: "wide", width: 1920, height: 1080 },
];

const WORKFLOW_ROUTES = [
  "/teacher/question-bank",
  "/teacher/learning-modules",
  "/teacher/activities",
  "/teacher/assessments",
];

/** Signs in and lands on the workspace. */
async function arrive(page) {
  await signIn(page, TEACHER_ADMIN_ACCOUNT);
  await page.waitForURL("**/teacher/**", { timeout: 20_000 });
}

describe("teacher content authoring", () => {
  test.skip(!isLocalDataEnvironment(), hostedDataSkipReason());

  // The competency everything else hangs off. Created through the API rather
  // than module 4's dialog: it is not what this run is about, and driving that
  // dialog coupled the suite to copy it does not own.
  let competencyId = null;

  test.beforeAll(async ({ request }) => {
    const token = await accessToken(request);
    competencyId = await createCompetency(request, token, {
      code: FIXTURE.competencyCode,
      name: FIXTURE.competencyName,
    });
  });

  test.afterAll(async ({ request }) => {
    const token = await accessToken(request);
    await removeCompetency(request, token, competencyId);
  });

  test.beforeEach(async ({ page }) => {
    await arrive(page);
  });

  // -------------------------------------------------------------------
  // 2. Question Bank
  // -------------------------------------------------------------------
  test("two questions are written and published", async ({ page }) => {
    await page.goto("/teacher/question-bank");
    await expect(page.getByRole("heading", { name: "Question Bank", level: 1 })).toBeVisible();

    for (const prompt of [FIXTURE.firstQuestion, FIXTURE.secondQuestion]) {
      await page.getByRole("button", { name: "New question", exact: true }).click();

      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Competency").selectOption({ label: FIXTURE.competencyLabel });
      await dialog.getByLabel("Question type").selectOption("number_input");
      await dialog.getByLabel("Question text").fill(prompt);
      await dialog.getByLabel("Correct answer").fill("10");
      await dialog.getByLabel("Status").selectOption("published");
      await dialog.getByRole("button", { name: /^(Save|Create|Publish)/ }).click();

      await expect(dialog).toBeHidden({ timeout: 15_000 });
    }

    await expect(
      page.getByRole("heading", { name: FIXTURE.firstQuestion, level: 3 }),
    ).toBeVisible();
  });

  test("the bank filters on the server and says what it is showing", async ({ page }) => {
    await page.goto("/teacher/question-bank?status=published");

    // The caption describes the rows above it, in the state the address names,
    // rather than counting every status in the bank.
    // `.first()`, because the caption is said twice on purpose: once on the
    // page and once into a screen-reader live region. Matching both is a
    // strict-mode violation the moment the announcer has caught up, which
    // under a loaded worker it has.
    await expect(
      page.getByText(/^Showing \d+–\d+ of \d+ published questions$/).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: FIXTURE.firstQuestion, level: 3 }),
    ).toBeVisible();

    // A state with nothing in it is reported honestly rather than looking
    // empty because none of its rows happened to land on this page.
    await page.getByRole("link", { name: /^Draft/ }).click();
    await expect(page).toHaveURL(/status=draft/);
    await expect(
      page.getByRole("heading", { name: FIXTURE.firstQuestion, level: 3 }),
    ).toBeHidden();

    // Searching narrows the current state instead of resetting it. The wait is
    // not ceremony: the field is uncontrolled, so typing into it before the
    // navigation has settled fills the box the previous page rendered and the
    // new one submits empty.
    await page.getByRole("link", { name: /^Published/ }).click();
    await expect(page).toHaveURL(/status=published/);
    await expect(
      page.getByRole("heading", { name: FIXTURE.firstQuestion, level: 3 }),
    ).toBeVisible();

    await page.getByLabel("Search questions").fill(RUN);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`search=${RUN}`));
    await expect(page).toHaveURL(/status=published/);
    await expect(
      page.getByRole("heading", { name: FIXTURE.firstQuestion, level: 3 }),
    ).toBeVisible();

    // And the filters survive a page move.
    await page.getByLabel("Difficulty").selectOption("medium");
    await expect(page).toHaveURL(/difficulty=medium/);
    await expect(page).toHaveURL(/status=published/);
  });

  // -------------------------------------------------------------------
  // 3. Learning Modules
  // -------------------------------------------------------------------
  test("a module is created against the competency", async ({ page }) => {
    await page.goto("/teacher/learning-modules");
    await page.getByRole("button", { name: "New module", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Competency").selectOption({ label: FIXTURE.competencyLabel });
    await dialog.getByLabel("Module title").fill(FIXTURE.moduleTitle);
    await dialog.getByLabel("Study time (minutes)").fill("15");
    await dialog.getByLabel("Order in the learning path").fill("91");
    await dialog.getByLabel("Learning objective").fill("Add two numbers below twenty.");
    await dialog.getByLabel("Short explanation").fill("Count on from the larger number.");
    await dialog.getByRole("button", { name: /^(Save|Create)/ }).click();

    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await page.goto("/teacher/learning-modules?status=draft");
    await expect(
      page.getByRole("heading", { name: FIXTURE.moduleTitle, level: 3 }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------
  // 4. Activities, and their questions
  // -------------------------------------------------------------------
  test("an activity is created against the module", async ({ page }) => {
    await page.goto("/teacher/activities");
    await page.getByRole("button", { name: "Create activity", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Activity title").fill(FIXTURE.activityTitle);
    await dialog.getByLabel("Learning module").selectOption({ label: FIXTURE.moduleTitle });
    await dialog.getByLabel("Estimated time").fill("15");
    await dialog.getByRole("button", { name: "Create activity" }).click();

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: FIXTURE.activityTitle, level: 3 }),
    ).toBeVisible();

    // An activity with no questions says so, in words rather than by omission.
    await expect(
      page
        .getByText("This activity holds no questions, so it cannot be published yet.")
        .first(),
    ).toBeVisible();
  });

  test("activity questions are attached, reordered, and survive a reload", async ({ page }) => {
    await page.goto("/teacher/activities");
    await page.getByRole("button", { name: `Questions in ${FIXTURE.activityTitle}` }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Search questions").fill(RUN);
    await expect(dialog.getByText(FIXTURE.firstQuestion).first()).toBeVisible();

    for (const prompt of [FIXTURE.firstQuestion, FIXTURE.secondQuestion]) {
      await dialog.getByRole("button", { name: `Add ${prompt}` }).click();
    }

    await expect(dialog.getByText("2 of 200 chosen")).toBeVisible();

    // The chosen list names its questions rather than reporting that they are
    // not on the current page of the bank.
    const chosen = dialog.locator("ol > li");
    await expect(chosen.first()).toContainText(FIXTURE.firstQuestion);

    await dialog.getByRole("button", { name: `Move ${FIXTURE.secondQuestion} earlier` }).click();
    await expect(chosen.first()).toContainText(FIXTURE.secondQuestion);

    await dialog.getByRole("button", { name: "Save question list" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // The order is the stored order, not a screen artefact.
    await page.reload();
    await page.getByRole("button", { name: `Questions in ${FIXTURE.activityTitle}` }).click();

    const reopened = page.getByRole("dialog");
    const reordered = reopened.locator("ol > li");
    await expect(reordered.first()).toContainText(FIXTURE.secondQuestion);
    await expect(reordered.nth(1)).toContainText(FIXTURE.firstQuestion);
    await reopened.getByRole("button", { name: "Cancel" }).click();
  });

  test("publishing the activity is refused until its module is published", async ({ page }) => {
    await page.goto("/teacher/activities");
    await page.getByRole("button", { name: `Publish ${FIXTURE.activityTitle}` }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Publish", exact: true }).click();

    // The module is still a draft, so a learner could not open this activity.
    // The server says so rather than the browser predicting it.
    await expect(dialog.getByRole("alert")).toContainText(/learning module/i);
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  // -------------------------------------------------------------------
  // 5. Assessments
  // -------------------------------------------------------------------
  test("an assessment is created without being asked for a grade", async ({ page }) => {
    await page.goto("/teacher/assessments");
    await page.getByRole("button", { name: "New assessment", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill(FIXTURE.assessmentTitle);

    // MathSmart teaches one grade and the server resolves it.
    await expect(dialog.getByLabel("Grade level")).toHaveCount(0);

    await dialog.getByLabel("Time limit in minutes").fill("30");
    await dialog.getByRole("button", { name: /^(Save|Create)/ }).click();

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: FIXTURE.assessmentTitle, level: 3 }),
    ).toBeVisible();
  });

  test("assessment questions are attached and reordered", async ({ page }) => {
    await page.goto("/teacher/assessments");
    await page
      .getByRole("button", { name: `Questions in ${FIXTURE.assessmentTitle}` })
      .click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Search questions").fill(RUN);
    await expect(dialog.getByText(FIXTURE.firstQuestion).first()).toBeVisible();

    for (const prompt of [FIXTURE.firstQuestion, FIXTURE.secondQuestion]) {
      await dialog.getByRole("button", { name: `Add ${prompt}` }).click();
    }

    const chosen = dialog.locator("ol > li");
    await dialog.getByRole("button", { name: `Move ${FIXTURE.secondQuestion} earlier` }).click();
    await expect(chosen.first()).toContainText(FIXTURE.secondQuestion);

    await dialog.getByRole("button", { name: "Save question list" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------
  // 6. Archive, restore, and permanent deletion
  // -------------------------------------------------------------------
  test("a question seated in an activity cannot be deleted", async ({ page }) => {
    await page.goto(`/teacher/question-bank?status=published&search=${RUN}`);

    // Every row action names its own row, so this one is unambiguous. The row
    // is waited for first: the caption tells us the read has resolved, and the
    // button only exists once it has.
    await expect(
      page.getByRole("heading", { name: FIXTURE.firstQuestion, level: 3 }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: `Archive ${FIXTURE.firstQuestion}` })
      .click();
    const archiveDialog = page.getByRole("dialog");
    await archiveDialog.getByRole("button", { name: "Archive question" }).click();
    await expect(archiveDialog).toBeHidden({ timeout: 15_000 });

    await page.goto(`/teacher/question-bank?status=archived&search=${RUN}`);
    await page
      .getByRole("button", { name: `Delete permanently ${FIXTURE.firstQuestion}` })
      .click();

    const deleteDialog = page.getByRole("dialog");
    // The preview names what is holding it, and the confirmation stays
    // unavailable: nothing a learner or a teacher built is removed to make
    // room for a deletion.
    await expect(deleteDialog.getByText(/blocks deletion/).first()).toBeVisible();
    await expect(deleteDialog.getByLabel(/Type CONFIRM/)).toBeDisabled();
    await expect(deleteDialog.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
    await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("the disposable records are removed, and the questions survive", async ({ page }) => {
    // Assessment first: it holds the questions, and removing it frees them.
    await page.goto("/teacher/assessments");
    await page.getByRole("button", { name: `Archive ${FIXTURE.assessmentTitle}` }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^Archive/ }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await page.getByRole("tab", { name: "Archived" }).click();
    await page
      .getByRole("button", { name: `Delete permanently ${FIXTURE.assessmentTitle}` })
      .click();

    dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(/The questions themselves stay in the Question Bank/),
    ).toBeVisible();
    await dialog.getByLabel(/Type CONFIRM/).fill("CONFIRM");
    await dialog.getByLabel(/I understand/).check();
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // Then the activity, the same way.
    await page.goto("/teacher/activities");
    await page.getByRole("button", { name: `Archive ${FIXTURE.activityTitle}` }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^Archive/ }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await page.goto("/teacher/activities");
    await page.getByLabel("Status").selectOption("archived");
    await page
      .getByRole("button", { name: `Delete permanently ${FIXTURE.activityTitle}` })
      .click();

    dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Type CONFIRM/).fill("CONFIRM");
    await dialog.getByLabel(/I understand/).check();
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // The reusable questions are still in the bank. That is the whole point of
    // the membership cascade: the set goes, the items it named do not. One was
    // already archived by the refusal test; the other is archived here so both
    // can be looked at in the same place.
    await page.goto(`/teacher/question-bank?status=published&search=${RUN}`);
    await page
      .getByRole("button", { name: `Archive ${FIXTURE.secondQuestion}` })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Archive question" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await page.goto(`/teacher/question-bank?status=archived&search=${RUN}`);
    await expect(
      page.getByRole("heading", { name: FIXTURE.firstQuestion, level: 3 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: FIXTURE.secondQuestion, level: 3 }),
    ).toBeVisible();

    // And now nothing points at them, so they can go.
    for (const prompt of [FIXTURE.firstQuestion, FIXTURE.secondQuestion]) {
      await page.goto(`/teacher/question-bank?status=archived&search=${RUN}`);
      await page.getByRole("button", { name: `Delete permanently ${prompt}` }).click();

      dialog = page.getByRole("dialog");
      await expect(dialog.getByText(/Nothing points at this question/)).toBeVisible();
      await dialog.getByLabel(/Type CONFIRM/).fill("CONFIRM");
      await dialog.getByLabel(/I understand/).check();
      await dialog.getByRole("button", { name: "Delete permanently" }).click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
    }

    // The module, once its activity has gone.
    await page.goto("/teacher/learning-modules?status=draft");
    await page.getByRole("button", { name: `Archive ${FIXTURE.moduleTitle}` }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^Archive/ }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await page.goto("/teacher/learning-modules?status=archived");
    await page
      .getByRole("button", { name: `Delete permanently ${FIXTURE.moduleTitle}` })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Type CONFIRM/).fill("CONFIRM");
    await dialog.getByLabel(/I understand/).check();
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------
  // Every width
  // -------------------------------------------------------------------
  test("every screen in the workflow fits every width", async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const route of WORKFLOW_ROUTES) {
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );

        // One pixel of slack for sub-pixel rounding; anything more is a row, a
        // badge or a filter pushing the workspace sideways.
        expect(overflow, `${route} at ${viewport.name}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
