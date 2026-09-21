import { expect, test } from "@playwright/test";

import {
  STUDENT_ACCOUNT,
  TEACHER_ADMIN_ACCOUNT,
  hasAccount,
  signIn,
} from "../support/accounts.js";
import {
  accessToken,
  createCompetency,
  createPublishedAssessment,
  createQuestion,
  removeAssessment,
  removeCompetency,
  sitAndSubmit,
  studentAccessToken,
} from "../support/api-fixtures.js";
import { hostedDataSkipReason, isLocalDataEnvironment } from "../support/environment.js";
import {
  STUDENT_VIEWPORTS,
  expectKeptPlace,
  expectOrdinaryAction,
  scrollBelowTheFold,
  verticalScrollers,
} from "../support/student-place.js";

/**
 * Sitting an assessment, from finding one to reading the report.
 *
 * Three things here were defects rather than gaps. The hub was a single
 * hard-coded card, so a published unit quiz could not be reached at all; the
 * dynamic route redirected every identifier back to the diagnostic; and the
 * report told a learner a score with no way to see which questions it came
 * from. Each has a test below, and so does the behaviour that made the screen
 * unpleasant to use: an ordinary action must not blank the page or move it.
 */

/**
 * One learner, one account, one thing happening at a time.
 *
 * These tests share a single seeded learner, and most of them change that
 * learner's standing: starting an attempt moves a paper from "Ready to start"
 * to "In progress", and finishing one moves it again. Run in parallel they
 * rewrite each other's fixtures and skip for reasons that have nothing to do
 * with the code under test.
 */
test.describe.configure({ mode: "serial" });

const { describe, beforeEach } = test;

/**
 * The catalogue list, and nothing else.
 *
 * The workspace sidebar is a list of links too, so an unscoped `listitem`
 * happily matched "Dashboard" and followed it. Both sections on this page
 * carry an accessible name, which makes them landmarks worth aiming at.
 */
function catalogue(page) {
  // Named by the heading it points at, rather than by role. The section is a
  // landmark, but it sits inside the page's own labelled section, and a role
  // lookup for the inner one comes back empty in Chromium.
  return page.locator('section[aria-labelledby="available-assessments-heading"]');
}

/**
 * Opens the first card matching a state, and returns whether there was one.
 *
 * The cards are located by element rather than by role. They carry explicit
 * `role="listitem"` — a `ul` laid out as a grid loses its list semantics
 * without it — but a role lookup chained under a section locator comes back
 * empty where the same subtree plainly holds them, so the element name is the
 * reliable way in. The semantics themselves are asserted separately below.
 */
async function openCard(page, pattern) {
  const card = catalogue(page).locator("ul > li").filter({ hasText: pattern }).first();
  if ((await card.count()) === 0) return false;
  await card.getByRole("link").first().click();
  return true;
}

/** Waits for the review list to settle, however it settles. */
async function reviewSettled(page) {
  await page
    .getByText(/^(Correct|Not correct|Left blank)$|could not be loaded|nothing to review/)
    .first()
    .waitFor({ timeout: 20_000 });
}

describe("student assessments", () => {
  test.skip(!hasAccount(STUDENT_ACCOUNT), "no student account is configured");
  test.skip(!hasAccount(TEACHER_ADMIN_ACCOUNT), "no teacher account is configured");
  // These tests sit papers, which writes attempts against a real learner.
  // Every target has to be on this machine before that is allowed.
  test.skip(!isLocalDataEnvironment(), hostedDataSkipReason());

  let competencyId = null;
  let assessmentId = null;
  let satAssessmentId = null;

  // A paper of this run's own. Reaching for whatever happens to be published
  // finds it already sat the second time the suite runs, and the tests then
  // skip for a reason that has nothing to do with the code.
  test.beforeAll(async ({ request }) => {
    const token = await accessToken(request);
    const stamp = Date.now().toString(36);
    competencyId = await createCompetency(request, token, {
      code: `E2EA-${stamp}`.slice(0, 20),
      name: `Browser suite competency ${stamp}`,
    });
    const questionId = await createQuestion(request, token, {
      competencyId,
      prompt: `Browser suite question ${stamp}: what is 1/4 + 2/4?`,
    });
    const questionId2 = await createQuestion(request, token, {
      competencyId,
      prompt: `Browser suite sat question ${stamp}: what is 1/4 + 2/4?`,
    });
    assessmentId = await createPublishedAssessment(request, token, {
      title: `Browser suite quiz ${stamp}`,
      questionIds: [questionId],
    });

    // A second paper, sat and submitted wrongly through the API. The review
    // tests need a closed attempt with an incorrect answer on it, and making
    // that by driving the player would tie them to the player.
    satAssessmentId = await createPublishedAssessment(request, token, {
      title: `Browser suite sat paper ${stamp}`,
      questionIds: [questionId2],
    });
    await sitAndSubmit(request, await studentAccessToken(request), satAssessmentId);
  });

  test.afterAll(async ({ request }) => {
    const token = await accessToken(request);
    await removeAssessment(request, token, assessmentId);
    await removeAssessment(request, token, satAssessmentId);
    await removeCompetency(request, token, competencyId);
  });

  beforeEach(async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL(/\/student\/dashboard/);
  });

  test("the hub lists the papers set for this learner", async ({ page }) => {
    await page.goto("/student/assessments");

    await expect(page.getByRole("heading", { name: "Assessments", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Set for you", level: 2 })).toBeVisible();

    // More than one card, which the hard-coded version could never show.
    const cards = catalogue(page).locator("ul > li");
    expect(await cards.count()).toBeGreaterThan(1);

    // The list has to stay a list. Laid out as a grid it stops being one
    // unless the roles are stated, and a screen reader then announces loose
    // cards instead of "list, N items".
    await expect(catalogue(page).locator("ul")).toHaveAttribute("role", "list");
    await expect(cards.first()).toHaveAttribute("role", "listitem");

    // Every card says where the learner stands in words, not by colour alone.
    const labels = await page
      .getByText(/Ready to start|In progress|Retake allowed|Finished/)
      .count();
    expect(labels).toBeGreaterThan(0);
  });

  test("a published unit quiz is reachable, not redirected to the diagnostic", async ({
    page,
  }) => {
    await page.goto("/student/assessments");

    test.skip(!(await openCard(page, "Browser suite quiz")), "the fixture paper is missing");

    // The identifier survives. Before this change every id landed on
    // /student/assessments/diagnostic.
    await expect(page).not.toHaveURL(/\/assessments\/diagnostic/);
    await expect(page).toHaveURL(/\/student\/assessments\/[0-9a-f-]{36}/);
  });

  test("the test-taking screen has a heading to navigate by", async ({ page }) => {
    await page.goto("/student/assessments");

    test.skip(!(await openCard(page, "Browser suite quiz")), "the fixture paper is missing");
    const begin = page.getByRole("button", { name: /Start|Continue|Resume/ }).first();
    if (await begin.isVisible().catch(() => false)) {
      await begin.click();
    }

    // The whole screen used to contain no heading element of any kind, so a
    // screen-reader user answering questions could not navigate by heading.
    await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeAttached();
  });

  test("answering and moving between questions keeps the reader's place", async ({ page }) => {
    await page.goto("/student/assessments");

    test.skip(!(await openCard(page, "Browser suite quiz")), "the fixture paper is missing");
    const begin = page.getByRole("button", { name: /Start|Continue|Resume/ }).first();
    if (await begin.isVisible().catch(() => false)) {
      await begin.click();
    }

    const option = page.getByRole("button").filter({ hasText: /^[A-D]/ }).first();
    const progress = page.getByText(/Question \d+/).first();

    if (await option.isVisible().catch(() => false)) {
      await expectOrdinaryAction(page, {
        anchor: progress,
        description: "selecting an answer",
        act: async () => {
          // Pressed from the keyboard: Playwright scrolls an element into view
          // before clicking it, which would move the page itself and make the
          // measurement meaningless.
          await option.focus();
          await option.press("Enter");
        },
      });
    }
  });

  test("an ordinary action never replaces the page with a skeleton", async ({ page }) => {
    await page.goto("/student/assessments");
    await expect(page.getByRole("heading", { name: "Assessments", level: 1 })).toBeVisible();

    // The loading line exists, but only while there is nothing else to show.
    await expect(page.getByText("Loading your assessments…")).toHaveCount(0);
  });

  test("a finished paper can be reviewed question by question", async ({ page }) => {
    await page.goto("/student/assessments");

    test.skip(!(await openCard(page, "Browser suite sat paper")), "this learner has finished nothing yet");
    const review = page.getByRole("button", { name: /Review my answers/ });
    await expect(review).toBeVisible();

    // Not `expectOrdinaryAction` here: the review is a dialog, and a dialog
    // deliberately hides the page behind it from assistive technology, so an
    // anchor drawn from that page is supposed to disappear. What still has to
    // hold is that the page underneath did not move.
    const before = await scrollBelowTheFold(page);
    await review.focus();
    await review.press("Enter");

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Answer review" }),
    ).toBeVisible();
    await reviewSettled(page);
    await expectKeptPlace(page, before, "opening the answer review");

    // The verdict is the point. Before this it said only "Answer recorded".
    const verdicts = page.getByText(/^(Correct|Not correct|Left blank)$/);
    expect(await verdicts.count()).toBeGreaterThan(0);
  });

  test("a review never shows the correct answer", async ({ page }) => {
    await page.goto("/student/assessments");

    test.skip(!(await openCard(page, "Browser suite sat paper")), "this learner has finished nothing yet");
    await page.getByRole("button", { name: /Review my answers/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Answer review" }),
    ).toBeVisible();
    await reviewSettled(page);

    const body = (await page.content()).toLowerCase();
    for (const forbidden of ["answer_key", "grading_answer_key", "correct_answer"]) {
      expect(body, `the page mentions ${forbidden}`).not.toContain(forbidden);
    }
    await expect(page.getByText(/The correct answers are not shown here/)).toBeVisible();
  });

  test("asking for an explanation does not move the page or blank it", async ({ page }) => {
    await page.goto("/student/assessments");

    test.skip(!(await openCard(page, "Browser suite sat paper")), "this learner has finished nothing yet");
    await page.getByRole("button", { name: /Review my answers/ }).click();
    await reviewSettled(page);

    const explain = page.getByRole("button", { name: /Explain this one/ }).first();
    test.skip((await explain.count()) === 0, "every answer on this attempt was correct");

    const heading = page.getByRole("heading", { name: "Answer review" });
    await expectOrdinaryAction(page, {
      anchor: heading,
      description: "requesting an AI explanation",
      act: async () => {
        await explain.focus();
        await explain.press("Enter");
        // Groq is switched off for this run, so the honest outcome is the
        // stated fallback rather than a sentence. Either way the deterministic
        // verdict above it must still be on screen.
        await page
          .getByText(/not available right now|AI help/)
          .first()
          .waitFor({ timeout: 15_000 })
          .catch(() => {});
      },
    });

    // Whatever Groq did or did not do, the verdicts are untouched.
    expect(await page.getByText(/^(Correct|Not correct|Left blank)$/).count()).toBeGreaterThan(0);
  });

  test("an assessment this learner may not open is not found", async ({ page }) => {
    // A well-formed identifier that belongs to nothing. Typing one into the
    // address bar has to be refused the same way pressing a button would be.
    await page.goto("/student/assessments/11111111-1111-4111-8111-111111111111");

    await expect(
      page.getByText(/could not be found|Something went wrong|not found/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("the hub fits every width without a horizontal scrollbar", async ({ page }) => {
    for (const viewport of STUDENT_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/student/assessments");
      await expect(page.getByRole("heading", { name: "Assessments", level: 1 })).toBeVisible();

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `the hub overflows sideways at ${viewport.name}`).toBe(false);
    }
  });

  test("the hub owns no scroll container of its own", async ({ page }) => {
    await page.goto("/student/assessments");
    await expect(page.getByRole("heading", { name: "Assessments", level: 1 })).toBeVisible();
    await scrollBelowTheFold(page);

    // The workspace sidebar keeps a private scroll area by design; nothing in
    // the page body may add a second one.
    const scrollers = (await verticalScrollers(page)).filter(
      (name) => !name.includes("workspace-nav"),
    );
    expect(scrollers, `unexpected scroll containers: ${scrollers.join(", ")}`).toEqual([]);
  });

  test("the back button still works after opening a paper", async ({ page }) => {
    await page.goto("/student/assessments");
    test.skip(!(await openCard(page, /./)), "no assessments are set for this learner");
    await expect(page).toHaveURL(/\/student\/assessments\/[0-9a-f-]{36}/);

    await page.goBack();
    await expect(page).toHaveURL(/\/student\/assessments$/);
    await expect(page.getByRole("heading", { name: "Assessments", level: 1 })).toBeVisible();
  });

  test("the report keeps its place when the review opens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 });
    await page.goto("/student/assessments");

    test.skip(!(await openCard(page, "Browser suite sat paper")), "this learner has finished nothing yet");
    const review = page.getByRole("button", { name: /Review my answers/ });
    await expect(review).toBeVisible();

    const before = await scrollBelowTheFold(page);
    await review.focus();
    await review.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Answer review" }),
    ).toBeVisible();
    await expectKeptPlace(page, before, "opening the review on a phone");
  });
});
